import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    start: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },

    end: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
  },
  {
    _id: false,
  }
);


const clinicClosureSchema =
  new mongoose.Schema(
    {
      date: {
        type: String,
        required: true,
        unique: true,
        match: /^\d{4}-\d{2}-\d{2}$/,
      },

      isOpen: {
        type: Boolean,
        required: true,
      },

      shifts: {
        type: [shiftSchema],
        default: [],
      },

      note: {
        type: String,
        trim: true,
        maxlength: 300,
        default: '',
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );


const ClinicClosure = mongoose.model(
  'ClinicClosure',
  clinicClosureSchema
);

export default ClinicClosure;
