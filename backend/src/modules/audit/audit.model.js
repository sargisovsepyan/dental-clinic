import mongoose from 'mongoose';


const auditLogSchema =
  new mongoose.Schema(
    {
      requestId: {
        type: String,
        required: true,
        index: true,
      },

      actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
      },

      action: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
        index: true,
      },

      entityType: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
        index: true,
      },

      entityId: {
        type: String,
        trim: true,
        maxlength: 150,
        default: '',
      },

      method: {
        type: String,
        trim: true,
        maxlength: 10,
        default: '',
      },

      path: {
        type: String,
        trim: true,
        maxlength: 500,
        default: '',
      },

      ip: {
        type: String,
        trim: true,
        maxlength: 64,
        default: '',
      },

      userAgent: {
        type: String,
        trim: true,
        maxlength: 500,
        default: '',
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      createdAt: {
        type: Date,
        default: Date.now,
        immutable: true,
      },
    },
    {
      versionKey: false,
    }
  );


auditLogSchema.index({
  createdAt: -1,
});

auditLogSchema.index({
  actor: 1,
  createdAt: -1,
});

auditLogSchema.index({
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});


const AuditLog =
  mongoose.model(
    'AuditLog',
    auditLogSchema
  );


export default AuditLog;
