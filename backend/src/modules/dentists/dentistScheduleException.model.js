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


const dentistScheduleExceptionSchema =
  new mongoose.Schema(
    {
      dentist: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dentist',
        required: true,
        index: true,
      },

      date: {
        type: String,
        required: true,
        match: /^\d{4}-\d{2}-\d{2}$/,
      },

      isWorking: {
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


dentistScheduleExceptionSchema.index(
  {
    dentist: 1,
    date: 1,
  },
  {
    unique: true,
  }
);


const DentistScheduleException =
  mongoose.model(
    'DentistScheduleException',
    dentistScheduleExceptionSchema
  );


export default DentistScheduleException;
