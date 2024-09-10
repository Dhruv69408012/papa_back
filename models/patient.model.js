const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const patientSchema = new Schema(
  {
    name: {
      type: String,
    },
    roomno: {
      type: String,
    },
    morning: {
      type: [String],
      default: [],
    },
    evening: {
      type: [String],
      default: [],
    },
    night: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Patient", patientSchema);
