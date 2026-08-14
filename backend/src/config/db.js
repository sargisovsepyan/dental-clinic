import mongoose from 'mongoose';

import env from './env.js';
import logger from '../observability/logger.js';

const connectDB = async () => {
    const connection = await mongoose.connect(env.MONGO_URI, {
        autoIndex: env.NODE_ENV !== 'production',
    });

    logger.info('mongodb_connected', {
        database: connection.connection.name,
    });
};

export default connectDB;
