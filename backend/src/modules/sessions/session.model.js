import mongoose from 'mongoose';

import crypto from 'crypto';

const sessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        tokenHash: {
            type: String,
            required: true,
            unique: true,
        },

        familyId: {
            type: String,
            required: true,
            default: crypto.randomUUID,
            immutable: true,
            index: true,
        },

        expiresAt: {
            type: Date,
            required: true,
        },

        absoluteExpiresAt: {
            type: Date,
            required: true,
            immutable: true,
        },

        issuedAuthVersion: {
            type: Number,
            required: true,
            min: 0,
            immutable: true,
            select: false,
        },

        revokedAt: {
            type: Date,
            default: null,
        },

        compromisedAt: {
            type: Date,
            default: null,
        },

        userAgent: {
            type: String,
            trim: true,
            maxlength: 300,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

sessionSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

sessionSchema.index({
    user: 1,
    revokedAt: 1,
    createdAt: -1,
});

const Session = mongoose.model(
    'Session',
    sessionSchema
);

export default Session;
