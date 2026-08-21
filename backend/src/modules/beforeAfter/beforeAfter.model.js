import mongoose from 'mongoose';

import imageAssetSchema from '../media/imageAsset.schema.js';
import {
  UNVERIFIED_POLICY,
} from './beforeAfter.consent.js';

import {
  createTranslationsSchema,
  requirePrimaryContent,
} from '../../i18n/localization.js';

const caseTranslationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
  },
  { _id: false }
);


const consentHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['confirmed', 'withdrawn', 'purged'],
      required: true,
    },
    policyVersion: {
      type: String,
      trim: true,
      maxlength: 40,
      required: true,
    },
    method: {
      type: String,
      enum: [
        'written',
        'digital',
        'verbal',
        'external',
        'legacy_migrated',
        'legacy_unverified',
        'governance_action',
      ],
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { _id: false }
);


const beforeAfterCaseSchema =
  new mongoose.Schema(
    {
      title: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 200,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: '',
      },

      translations: {
        type: createTranslationsSchema(
          caseTranslationSchema
        ),
        default: () => ({}),
      },

      service: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'Service',

        default: null,

        index: true,
      },

      dentist: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'Dentist',

        default: null,

        index: true,
      },

      beforeImage: {
        type:
          imageAssetSchema,

        default: null,
      },

      afterImage: {
        type:
          imageAssetSchema,

        default: null,
      },

      publicationStatus: {
        type: String,
        enum: ['draft', 'published', 'withdrawn', 'purged'],
        default: 'draft',
        index: true,
      },

      consentStatus: {
        type: String,
        enum: ['active', 'unverified', 'withdrawn', 'purged'],
        default: 'active',
        index: true,
      },

      consentPolicyVersion: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40,
      },

      consentMethod: {
        type: String,
        enum: [
          'written',
          'digital',
          'verbal',
          'external',
          'legacy_migrated',
          'legacy_unverified',
        ],
        required: true,
      },

      consentConfirmedAt: {
        type: Date,
        required() {
          return this.consentStatus !== 'unverified';
        },
        immutable: true,
      },

      consentRecordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required() {
          return this.consentStatus !== 'unverified';
        },
        immutable: true,
      },

      externalConsentReference: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
        select: false,
      },

      withdrawnAt: { type: Date, default: null },
      withdrawnBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      withdrawalReason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: '',
      },
      purgedAt: { type: Date, default: null },
      purgedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      consentHistory: {
        type: [consentHistorySchema],
        default: () => [],
      },

      isFeatured: {
        type: Boolean,
        default: false,
        index: true,
      },

      isActive: {
        type: Boolean,
        default: true,
        index: true,
      },

      sortOrder: {
        type: Number,
        min: 0,
        max: 10000,
        default: 0,
      },

      createdBy: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'User',

        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );


beforeAfterCaseSchema.index({
  isActive: 1,
  isFeatured: -1,
  sortOrder: 1,
  createdAt: -1,
});

beforeAfterCaseSchema.index({
  publicationStatus: 1,
  consentStatus: 1,
  isActive: 1,
});

beforeAfterCaseSchema.pre('validate', function () {
  requirePrimaryContent(
    this,
    ['title'],
    'Published before/after case'
  );

  if (this.publicationStatus !== 'purged') {
    if (!this.beforeImage?.publicId || !this.afterImage?.publicId) {
      this.invalidate(
        'beforeImage',
        'Non-purged before/after cases require both images'
      );
    }
  }

  if (
    this.publicationStatus === 'published' &&
    (this.consentStatus !== 'active' || !this.isActive)
  ) {
    this.invalidate(
      'publicationStatus',
      'Published cases require active consent and active publication'
    );
  }

  if (
    this.consentStatus === 'unverified' &&
    (
      this.consentPolicyVersion !== UNVERIFIED_POLICY ||
      this.consentMethod !== 'legacy_unverified' ||
      this.publicationStatus !== 'draft' ||
      this.isActive ||
      this.isFeatured
    )
  ) {
    this.invalidate(
      'consentStatus',
      'Unverified historical consent must remain quarantined as a non-public draft'
    );
  }
});


const BeforeAfterCase =
  mongoose.model(
    'BeforeAfterCase',
    beforeAfterCaseSchema
  );


export default BeforeAfterCase;
