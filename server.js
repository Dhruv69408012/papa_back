const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS with specific options
app.use(
  cors({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const ROOMS_FILE = path.join(__dirname, "rooms.json");
const CSV_FILE = path.join(__dirname, "bookings.csv");

// Helper function to load rooms
async function loadRooms() {
  try {
    const data = await fs.promises.readFile(ROOMS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      // If file doesn't exist, create default rooms
      const defaultRooms = [
        { roomNumber: "101", roomType: "Single", isActive: true },
        { roomNumber: "102", roomType: "Single", isActive: true },
        { roomNumber: "103", roomType: "Single", isActive: true },
        { roomNumber: "201", roomType: "2Share", isActive: true },
        { roomNumber: "202", roomType: "2Share", isActive: true },
        { roomNumber: "203", roomType: "2Share", isActive: true },
        { roomNumber: "301", roomType: "3Share", isActive: true },
        { roomNumber: "302", roomType: "3Share", isActive: true },
        { roomNumber: "303", roomType: "3Share", isActive: true },
        { roomNumber: "401", roomType: "VIP", isActive: true },
        { roomNumber: "402", roomType: "VIP", isActive: true },
        { roomNumber: "403", roomType: "VIP", isActive: true },
      ];
      await fs.promises.writeFile(
        ROOMS_FILE,
        JSON.stringify(defaultRooms, null, 2)
      );
      return defaultRooms;
    }
    throw error;
  }
}

// Helper function to parse CSV data to array
function parseCSV(csvString) {
  const [headerLine, ...lines] = csvString.trim().split("\n");
  if (!headerLine || lines.length === 0) return [];

  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx];
    });
    return obj;
  });
}

// Helper function to convert array to CSV
function arrayToCSV(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return "startDate,endDate,roomNumber,share,status,patientName\n";
  }

  const headers = [
    "startDate",
    "endDate",
    "roomNumber",
    "share",
    "status",
    "patientName",
  ];
  const escapeCSV = (value) => {
    if (typeof value !== "string") value = String(value || "");
    // Escape double quotes by doubling them
    let escaped = value.replace(/"/g, '""');
    // If value contains comma, newline, or double quote, wrap in double quotes
    if (/[",\n]/.test(escaped)) {
      escaped = `"${escaped}"`;
    }
    return escaped;
  };
  const csvLines = array.map((obj) => {
    return headers.map((header) => escapeCSV(obj[header] || "")).join(",");
  });

  return headers.join(",") + "\n" + csvLines.join("\n");
}

// Helper function to read from CSV
async function readFromCSV() {
  try {
    const csvData = await fs.promises.readFile(CSV_FILE, "utf8");
    return parseCSV(csvData);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// Helper function to continuously write to CSV
async function writeToCSV(bookings) {
  const tempFile = CSV_FILE + ".tmp";
  try {
    const csvData = arrayToCSV(bookings);
    // Write to temporary file first
    await fs.promises.writeFile(tempFile, csvData);
    // Atomically rename temp file to target file
    await fs.promises.rename(tempFile, CSV_FILE);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.promises.unlink(tempFile);
    } catch (unlinkError) {
      // Ignore error if temp file doesn't exist
    }
    throw error;
  }
}

// Helper function to check for booking conflicts
function hasBookingConflict(newBooking, existingBookings) {
  const newStart = new Date(newBooking.startDate);
  const newEnd = new Date(newBooking.endDate);

  return existingBookings.some((booking) => {
    if (
      booking.roomNumber !== newBooking.roomNumber ||
      booking.share !== newBooking.share
    ) {
      return false;
    }

    const existingStart = new Date(booking.startDate);
    const existingEnd = new Date(booking.endDate);

    // Check if the new booking overlaps with any existing booking
    return (
      (newStart >= existingStart && newStart < existingEnd) || // New booking starts during existing booking
      (newEnd > existingStart && newEnd <= existingEnd) || // New booking ends during existing booking
      (newStart <= existingStart && newEnd >= existingEnd) // New booking completely encompasses existing booking
    );
  });
}

// Startup task: convert all 'booked' entries that include today's date to 'pending'
async function migrateBookedToPendingForToday() {
  try {
    const bookings = await readFromCSV();
    if (!Array.isArray(bookings) || bookings.length === 0) return;

    // Build today's date as local YYYY-MM-DD to avoid UTC shift
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // Compare as ISO date strings (YYYY-MM-DD) lexicographically
    const isInRange = (dateStr, startStr, endStr) => {
      return startStr <= dateStr && dateStr <= endStr;
    };

    let changedCount = 0;
    const updated = bookings.map((booking) => {
      if (
        booking.status === "booked" &&
        isInRange(todayStr, booking.startDate, booking.endDate)
      ) {
        changedCount += 1;
        return { ...booking, status: "pending" };
      }
      return booking;
    });

    if (changedCount > 0) {
      await writeToCSV(updated);
    }
    console.log(
      `[startup] Converted ${changedCount} booked booking(s) to pending for ${todayStr}`
    );
  } catch (error) {
    console.error("[startup] Failed to migrate booked->pending:", error);
  }
}

// API endpoints
app.get("/api/rooms", async (req, res) => {
  try {
    const rooms = await loadRooms();
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: "Failed to load rooms" });
  }
});

// Move CSV endpoint before the roomNumber endpoint to prevent route conflict
app.get("/api/bookings/csv", async (req, res) => {
  try {
    const bookings = await readFromCSV();
    const csvData = arrayToCSV(bookings);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="bookings.csv"');

    res.status(200).send(csvData);
  } catch (error) {
    res.status(500).json({ error: "Failed to download bookings CSV" });
  }
});

app.get("/api/bookings/:roomNumber", async (req, res) => {
  try {
    const { roomNumber } = req.params;
    const bookings = await readFromCSV();
    const roomBookings = bookings.filter(
      (booking) => booking.roomNumber === roomNumber
    );
    res.json(roomBookings);
  } catch (error) {
    res.status(500).json({ error: "Failed to read room bookings" });
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const { patientName, startDate, endDate, roomNumber, shareNumber } =
      req.body;

    if (!patientName || !startDate || !endDate || !roomNumber || !shareNumber) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const bookings = await readFromCSV();

    const formatDate = (date) => new Date(date).toISOString().split("T")[0];

    const newBooking = {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      roomNumber,
      share: shareNumber.toString(),
      status: "booked",
      patientName,
    };

    // Check for booking conflicts
    if (hasBookingConflict(newBooking, bookings)) {
      return res.status(409).json({
        error: "Booking conflict: Room is already booked for these dates",
      });
    }

    bookings.push(newBooking);

    await writeToCSV(bookings);
    res.json({ message: "Booking added successfully", booking: newBooking });
  } catch (error) {
    res.status(500).json({ error: "Failed to add booking" });
  }
});

app.delete("/api/bookings", async (req, res) => {
  try {
    const { patientName } = req.body;

    const bookings = await readFromCSV();

    // Check if any booking matches the patientName
    const anyNameMatch = bookings.some((booking) => {
      const match = !patientName || booking.patientName === patientName;
      return match;
    });

    if (patientName && !anyNameMatch) {
      return res
        .status(404)
        .json({ error: `No booking found for patient name: ${patientName}` });
    }

    const updatedBookings = bookings.filter((booking) => {
      return !(booking.patientName === patientName);
    });

    await writeToCSV(updatedBookings);
    res.json({ message: "Booking removed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove booking" });
  }
});

app.patch("/api/bookings/status", async (req, res) => {
  try {
    const {
      patientName,
      startDate,
      endDate,
      roomNumber,
      shareNumber,
      newStatus,
    } = req.body;

    const bookings = await readFromCSV();

    // Check if any booking matches the patientName
    const anyNameMatch = bookings.some(
      (booking) => !patientName || booking.patientName === patientName
    );
    if (patientName && !anyNameMatch) {
      return res
        .status(404)
        .json({ error: `No booking found for patient name: ${patientName}` });
    }

    const updatedBookings = bookings.map((booking) => {
      const match = !patientName || booking.patientName === patientName;
      if (match) {
        return { ...booking, status: newStatus };
      }
      return booking;
    });

    await writeToCSV(updatedBookings);
    res.json({ message: "Booking status updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update booking status" });
  }
});

// Add new endpoint for updating room associations
app.patch("/api/rooms/:roomNumber", async (req, res) => {
  const tempFile = ROOMS_FILE + ".tmp";
  try {
    const { roomNumber } = req.params;
    const { roomType, isActive } = req.body;

    const rooms = await loadRooms();
    const roomIndex = rooms.findIndex((room) => room.roomNumber === roomNumber);

    if (roomIndex === -1) {
      return res.status(404).json({ error: "Room not found" });
    }

    rooms[roomIndex] = {
      ...rooms[roomIndex],
      roomType: roomType || rooms[roomIndex].roomType,
      isActive: isActive !== undefined ? isActive : rooms[roomIndex].isActive,
    };

    // Write to temporary file first
    await fs.promises.writeFile(tempFile, JSON.stringify(rooms, null, 2));
    // Atomically rename temp file to target file
    await fs.promises.rename(tempFile, ROOMS_FILE);

    res.json({ message: "Room updated successfully", room: rooms[roomIndex] });
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.promises.unlink(tempFile);
    } catch (unlinkError) {
      // Ignore error if temp file doesn't exist
    }
    res.status(500).json({ error: "Failed to update room" });
  }
});

// Add stringifyCSV function
function stringifyCSV(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return "patientName,roomNumber,paidAmount,balance\n";
  }

  const headers = ["patientName", "roomNumber", "paidAmount", "balance"];
  const csvLines = array.map((obj) => {
    return headers
      .map((header) => {
        const value = obj[header] || "";
        // Convert value to string and handle special cases
        const stringValue = String(value);
        // Only wrap in quotes if the value contains a comma or is a string with spaces
        return stringValue.includes(",") ||
          (typeof value === "string" && value.includes(" "))
          ? `"${stringValue}"`
          : stringValue;
      })
      .join(",");
  });

  return headers.join(",") + "\n" + csvLines.join("\n");
}


app.patch("/api/bookings/move", async (req, res) => {
  try {
    const {
      patientName,
      startDate,
      endDate,
      oldRoomNumber,
      oldShareNumber,
      newRoomNumber,
      newShareNumber,
    } = req.body;

    if (
      !patientName ||
      !startDate ||
      !endDate ||
      !oldRoomNumber ||
      !oldShareNumber ||
      !newRoomNumber ||
      !newShareNumber
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const bookings = await readFromCSV();
    let found = false;
    const updatedBookings = bookings.map((booking) => {
      if (
        booking.patientName === patientName &&
        booking.startDate === startDate &&
        booking.endDate === endDate &&
        booking.roomNumber === oldRoomNumber &&
        booking.share === oldShareNumber
      ) {
        found = true;
        return {
          ...booking,
          roomNumber: newRoomNumber,
          share: newShareNumber,
        };
      }
      return booking;
    });

    if (!found) {
      return res.status(404).json({ error: "Booking not found" });
    }

    await writeToCSV(updatedBookings);
    res.json({ message: "Patient moved successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to move patient" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Run startup migration to update statuses
  migrateBookedToPendingForToday();
});
