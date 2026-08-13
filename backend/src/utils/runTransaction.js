import mongoose from 'mongoose';

const runTransaction = async (work) => {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });

    return result;
  }
  finally {
    await session.endSession();
  }
};

export default runTransaction;
