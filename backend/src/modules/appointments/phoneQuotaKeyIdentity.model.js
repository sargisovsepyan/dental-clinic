import mongoose from 'mongoose';


const phoneQuotaKeyIdentitySchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: 'phone-quota-key-identity',
    },
    keyVersion: {
      type: String,
      required: true,
      match: /^v[1-9][0-9]{0,5}$/,
    },
    secretFingerprint: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);


const PhoneQuotaKeyIdentity = mongoose.model(
  'PhoneQuotaKeyIdentity',
  phoneQuotaKeyIdentitySchema
);


export default PhoneQuotaKeyIdentity;
