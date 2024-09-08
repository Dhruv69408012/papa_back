const Patient = require("../models/patient.model");
const fs = require("fs");
const path = require("path");
require("dotenv").config(); // Add this if you're using a .env file

const LOG_FILE_PATH = path.join(__dirname, "log.txt"); // Path to the local log file

const controller = {
  add: async (req, res) => {
    try {
      const { name } = req.body;
      const ch = name.toLowerCase();
      const check = await Patient.findOne({ name: ch });

      if (check)
        return res
          .status(400)
          .json({ success: false, msg: "patient already registered" });

      const patient = new Patient({
        name: ch,
      });

      const data = await patient.save();
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(500).json({ success: false, msg: error?.message });
    }
  },

  spatient: async (req, res) => {
    const { name } = req.body;
    const ch = name.toLowerCase();
    const patient = await Patient.findOne({ name: ch });
    if (!patient) {
      return res.json({
        success: false,
        message: "No patient found",
      });
    }
    return res.json({
      success: true,
      message: "patient found",
      data: patient,
    });
  },

  streatment: async (req, res) => {
    try {
      const { treatments } = req.body;
      const treat = treatments.split(",");

      const patients = await Patient.find({
        $or: [
          { morning: { $in: treat } },
          { evening: { $in: treat } },
          { night: { $in: treat } },
        ],
      });

      const patientsWithMatchedTreatments = patients.map((patient) => {
        const matchedTreatments = {
          morning: patient.morning.filter((t) => treat.includes(t)),
          evening: patient.evening.filter((t) => treat.includes(t)),
          night: patient.night.filter((t) => treat.includes(t)),
        };
        return {
          ...patient.toObject(),
          matchedTreatments,
        };
      });

      return res.json({
        success: "true",
        data: patientsWithMatchedTreatments,
      });
    } catch (error) {
      console.error("Error finding patients:", error);
      return res.status(500).json({
        success: "false",
        message: "Error finding patients",
      });
    }
  },

  addtreatment: async (req, res) => {
    try {
      const { name, time, treatments } = req.body;
      const ch = name.toLowerCase();
      const tre = treatments.split(", ");
      const patient = await Patient.findOne({ name: ch });
      if (!patient) return res.json({ success: false });

      const previousTreatments = patient[time] || [];

      await Patient.updateOne({ name: ch }, { $set: { [time]: tre } });

      const updatedPatient = await Patient.findOne({ name: ch });

      const timestamp = new Date().toISOString();
      const logData = `Timestamp: ${timestamp}\nTime Frame: ${time}\nPrevious Treatments: ${previousTreatments.join(
        ", "
      )}\nUpdated Treatments: ${tre.join(", ")}\n\n`;

      fs.appendFileSync(LOG_FILE_PATH, logData);

      return res.json({
        success: true,
        message: "updated",
        data: updatedPatient,
      });
    } catch (error) {
      console.error("Error adding treatments:", error);
      fs.appendFileSync(LOG_FILE_PATH, `Error adding treatments: ${error.message}\n`);
      return res.json({ success: false, error: error.message });
    }
  },

  getlog: async (req, res) => {
    try {
      const logData = fs.readFileSync(LOG_FILE_PATH, 'utf8');
      return res.json({
        success: true,
        data: logData,
      });
    } catch (error) {
      return res.json({ success: false, error: error.message });
    }
  },
};

module.exports = controller;
