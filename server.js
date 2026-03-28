const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const mongoose = require("mongoose");
const multer = require("multer");

const app = express();
app.use(express.json());

/* -------- MULTER -------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

/* -------- DATABASE -------- */
mongoose.connect("mongodb://127.0.0.1:27017/test")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

/* -------- MODELS -------- */
const User = mongoose.model("User", {
  email: String,
  password: String,
  role: String
});

const Prescription = mongoose.model("Prescription", {
  userId: mongoose.Schema.Types.ObjectId,
  image: String,
  drugs: [String],
  status: String,
  note: String
});

const Drug = mongoose.model("Drug", {
  name: String,
  interactions: [String]
});

/* -------- SESSION -------- */
app.use(session({
  secret: "super_secret_key",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: "mongodb://127.0.0.1:27017/test"
  }),
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60
  }
}));

/* -------- INTERACTIONS -------- */
const interactions = [
  { drug1: "Paracetamol", drug2: "Ibuprofen", severity: "Low" },
  { drug1: "Aspirin", drug2: "Warfarin", severity: "High" },
  { drug1: "Metformin", drug2: "Alcohol", severity: "Medium" }
];

/* -------- ROUTES -------- */
const goRoutes = require("./go.js")(User, Prescription, upload, interactions);
app.use("/go", goRoutes);

/* -------- TEST -------- */
app.get("/", (req, res) => {
  res.send("Server running");
});

/* -------- STATIC -------- */
app.use("/uploads", express.static("uploads"));

/* -------- SERVER -------- */
app.listen(5000, () => {
  console.log("Server started on port 5000");
});