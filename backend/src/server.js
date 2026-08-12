import mongoose from 'mongoose';

import app from './app.js';
import connectDB from './config/db.js';
import env from './config/env.js';

const startServer = async () => {
    await connectDB();

    const server = app.listen(
        env.PORT,
        () => {
            console.log(
                `Server running on http://localhost:${env.PORT}`
            );
        }
    );

    const shutdown = async (
        signal
    ) => {
        console.log(
            `${signal} received`
        );

        server.close(async () => {
            await mongoose.connection.close();

            console.log(
                'Server and MongoDB connection closed'
            );

            process.exit(0);
        });
    };

    process.on(
        'SIGINT',
        () => shutdown('SIGINT')
    );

    process.on(
        'SIGTERM',
        () => shutdown('SIGTERM')
    );
};

startServer().catch(
    (error) => {
        console.error(
            `Failed to start server: ${error.message}`
        );

        process.exit(1);
    }
);