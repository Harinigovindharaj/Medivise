
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const mongoose = require("mongoose");
const multer = require("multer");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: "http://localhost:5000",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


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

//TEMPORARY
// app.use((req, res, next) => {
//   if (!req.session.userId) {
//     req.session.userId = new mongoose.Types.ObjectId(); 
//     req.session.role = "researcher";
//   }
//   next();
// });

const path = require("path");

app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/check-path", (req, res) => {
  res.send(path.join(__dirname, "../frontend"));
});
/* -------- STATIC -------- */
app.use("/uploads", express.static("uploads"));

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

// Add more realistic user fields
const User = mongoose.model("User", new mongoose.Schema({
  email:     String,
  password:  String,
  role:      String,
  age:       Number,
  condition: String
}));

// UPDATED Prescription model
const Prescription = mongoose.model("Prescription", new mongoose.Schema({
  userId:    mongoose.Schema.Types.ObjectId,
  patientName: String,   
  patientAge:  Number,   
  patientId:   String,   
  risk:        Number,  
  image:     String,
  drugs:     [String],
  status:    String,
  note:      String,
  decidedAt: Date,
  decidedBy: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
  analysis: {
    interactions: Array,
    overallRisk:  String,
    createdAt:    Date
  }
}));


const Drug = mongoose.model("Drug", new mongoose.Schema({
  name:         String,
  class:        String,
  interactions: [String]
}));



/* -------- INTERACTIONS (fallback only) -------- */
// const interactions = [
//   { drug1: "Paracetamol", drug2: "Ibuprofen", severity: "Low" },
//   { drug1: "Aspirin", drug2: "Warfarin", severity: "High" },
//   { drug1: "Metformin", drug2: "Alcohol", severity: "Medium" }
// ];

/* -------- ROUTES -------- */

const goRoutes = require("./go.js")(User, Prescription, upload, null, Drug);
const doctorRoutes = require("./doctorRoutes.js")(Prescription, User);
const pharmacistRoutes  = require("./pharmacistRoutes.js")(Prescription);

app.use("/go",          goRoutes);
app.use("/api/doctor",      doctorRoutes);
app.use("/pharmacist",  pharmacistRoutes); 

/* -------- TEST -------- */
app.get("/", (req, res) => {
  res.send("Server running");
});



/* -------- SERVER -------- */
app.listen(5000, () => {
  console.log("Server started on port 5000");
});
