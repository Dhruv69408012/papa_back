const Patient = require("../models/patient.model");
const fs = require("fs");
const { google } = require("googleapis");
const SCOPE = ["https://www.googleapis.com/auth/drive"];

async function authorize() {
  const jwtClient = new google.auth.JWT(
    process.env.CLIENT_EMAIL,
    null,
    process.env.PRIVATE_KEY,
    SCOPE
  );

  await jwtClient.authorize();

  return jwtClient;
}

async function getFirstFileId(authClient, folderId) {
  return new Promise((resolve, reject) => {
    const drive = google.drive({ version: "v3", auth: authClient });

    drive.files.list(
      {
        q: `'${folderId}' in parents and mimeType='text/plain'`,
        fields: "files(id, name)",
        pageSize: 1,
      },
      (err, res) => {
        if (err) {
          return reject("The API returned an error: " + err);
        }

        const files = res.data.files;
        if (files.length === 0) {
          return reject("No files found in the folder.");
        }

        resolve(files[0].id); // Return the ID of the first file found
      }
    );
  });
}

async function downloadFile(authClient, fileId, localPath) {
  return new Promise((resolve, reject) => {
    const drive = google.drive({ version: "v3", auth: authClient });

    const dest = fs.createWriteStream(localPath);

    drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
      (err, res) => {
        if (err) {
          return reject(err);
        }

        res.data
          .on("end", () => {
            resolve();
          })
          .on("error", (err) => {
            reject(err);
          })
          .pipe(dest);
      }
    );
  });
}

async function deleteFile(authClient, fileId) {
  return new Promise((resolve, reject) => {
    const drive = google.drive({ version: "v3", auth: authClient });

    drive.files.delete({ fileId }, (err) => {
      if (err) {
        return reject("The API returned an error: " + err);
      }

      resolve();
    });
  });
}

async function appendAndUploadFile(authClient, localPath, folderId) {
  return new Promise((resolve, reject) => {
    const drive = google.drive({ version: "v3", auth: authClient });

    const fileMetaData = {
      name: "test.txt",
      parents: [folderId],
    };

    drive.files.create(
      {
        resource: fileMetaData,
        media: {
          body: fs.createReadStream(localPath),
          mimeType: "text/plain",
        },
        fields: "id",
      },
      (error, file) => {
        if (error) {
          return reject(error);
        }
        resolve(file);
      }
    );
  });
}

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

      console.log(patientsWithMatchedTreatments);

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

      const authClient = await authorize();
      const folderId = "14khv7ZXgbCu1vjl6r0z24-hdZNhxF_hy";

      // Get the first file ID from the folder
      const fileId = await getFirstFileId(authClient, folderId);

      // Download the existing file
      const localFilePath = "./test.txt";
      await downloadFile(authClient, fileId, localFilePath);

      // Append the new data to the local file
      fs.appendFileSync(localFilePath, logData);

      // Delete the old file
      await deleteFile(authClient, fileId);

      // Upload the updated file
      await appendAndUploadFile(authClient, localFilePath, folderId);

      return res.json({
        success: true,
        message: "updated",
        data: updatedPatient,
      });
    } catch (error) {
      console.error("Error adding treatments:", error);
      return res.json({ success: false, error: error.message });
    }
  },
};

module.exports = controller;
