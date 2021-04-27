const config = require('config');
const { MongoClient, ObjectID, Code } = require('mongodb');
let _client = { mongo: {} };
Object.assign(config, process.env);

const mongoDb = MongoClient.connect(config.mongoConn, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((client) => {
    console.log(`Connected to Mongo: ${config.mongoDbName}`);
    _client.mongo = client;
    return client.db(config.mongoDbName);
  })
  .catch((err) => {
    console.log(err);
    throw new Error(err);
  });

async function getIncrementedId(sequenceName) {
  const dbClient = await mongoDb;
  var sequenceDocument = await dbClient.collection('_increments').findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { sequence_value: 1 } },
    { upsert: true });
  return sequenceDocument.value.sequence_value;
}

module.exports = {
  mongoDb,
  ObjectID,
  Code,
  mongoAppDb: mongoDb,
  client: _client,
  getIncrementedId
};
