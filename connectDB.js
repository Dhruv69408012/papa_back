const mongoose = require("mongoose");

const connect = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://dhruvvayugundla:DDD123ddd@cluster1.j4w98fr.mongodb.net/"
    );
    console.log("Connected to db");
  } catch (error) {
    throw error;
  }
};

connect();
