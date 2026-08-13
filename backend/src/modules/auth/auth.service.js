import User from '../users/user.model.js';
import Session from '../sessions/session.model.js';

import ApiError from '../../utils/ApiError.js';
import generateToken from '../../utils/generateToken.js';

import {
    generateRefreshToken,
    hashToken,
    getRefreshTokenExpiry,
} from '../../utils/refreshToken.js';

const formatUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
});

const login = async (
    email,
    password,
    userAgent = ''
) => {
    const normalizedEmail = email
        .trim()
        .toLowerCase();

    const user = await User.findOne({
        email: normalizedEmail,
        isActive: true,
    }).select('+password');

    if (!user) {
        throw new ApiError(
            401,
            'Invalid email or password'
        );
    }

    const passwordIsCorrect =
        await user.comparePassword(password);

    if (!passwordIsCorrect) {
        throw new ApiError(
            401,
            'Invalid email or password'
        );
    }

    const accessToken = generateToken(user);

    const refreshToken =
        generateRefreshToken();

    await Session.create({
        user: user._id,

        tokenHash:
            hashToken(refreshToken),

        expiresAt:
            getRefreshTokenExpiry(),

        userAgent,
    });

    const activeSessions =
        await Session.find({
            user: user._id,
            revokedAt: null,
            expiresAt: {
                $gt: new Date(),
            },
        })
            .sort({ createdAt: -1 })
            .select('_id')
            .lean();

    if (activeSessions.length > 5) {
        const oldSessionIds =
            activeSessions
                .slice(5)
                .map((session) => session._id);

        await Session.updateMany(
            {
                _id: {
                    $in: oldSessionIds,
                },
            },
            {
                $set: {
                    revokedAt: new Date(),
                },
            }
        );
    }

    return {
        accessToken,
        refreshToken,
        user: formatUser(user),
    };
};

const refresh = async (
    currentRefreshToken
) => {
    if (!currentRefreshToken) {
        throw new ApiError(
            401,
            'Refresh token is missing'
        );
    }

    const tokenHash =
        hashToken(currentRefreshToken);

    const nextRefreshToken =
        generateRefreshToken();

    const session = await Session.findOneAndUpdate({
        tokenHash,
        revokedAt: null,

        expiresAt: {
            $gt: new Date(),
        },
    }, {
        $set: {
            tokenHash:
                hashToken(nextRefreshToken),
            expiresAt:
                getRefreshTokenExpiry(),
        },
    }, {
        returnDocument: 'after',
    }).populate('user');

    if (
        !session ||
        !session.user ||
        !session.user.isActive
    ) {
        throw new ApiError(
            401,
            'Invalid or expired session'
        );
    }

    const accessToken =
        generateToken(session.user);

    return {
        accessToken,

        refreshToken:
            nextRefreshToken,

        user:
            formatUser(session.user),
    };
};

const logout = async (
    currentRefreshToken
) => {
    if (!currentRefreshToken) {
        return;
    }

    const tokenHash =
        hashToken(currentRefreshToken);

    await Session.updateOne(
        {
            tokenHash,
            revokedAt: null,
        },
        {
            $set: {
                revokedAt: new Date(),
            },
        }
    );
};

export {
    login,
    refresh,
    logout,
};
