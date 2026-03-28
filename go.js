const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
function isAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.send("Access denied");
  }
  next();
}
function isPatient(req, res, next) {
  if (!req.session.userId || req.session.role !== "patient") {
    return res.send("Access denied");
  }
  next();
}

function isResearcher(req, res, next) {
  if (!req.session.userId || req.session.role !== "researcher") {
    return res.send("Access denied");
  }
  next();
}
function isPharmacist(req, res, next) {
  if (!req.session.userId || req.session.role !== "pharmacist") {
    return res.send("Access denied");
  }
  next();
}
function isDoctor(req, res, next) {
  if (!req.session.userId || req.session.role !== "doctor") {
    return res.send("Access denied");
  }
  next();
}

module.exports = (User, Prescription, upload, interactions) => {
    

/* -------- AUTH -------- */

// Signup
router.post("/signup", async (req, res) => {
  const { email, password, role } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) return res.send("User already exists");

  const hashed = await bcrypt.hash(password, 10);

  const user = new User({ email, password: hashed, role });
  await user.save();

  res.send("User registered");
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.send("User not found");

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send("Wrong password");

  req.session.userId = user._id;
  req.session.role = user.role;

  let redirectUrl = "";

  if (user.role === "patient") redirectUrl = "/patient";
  else if (user.role === "doctor") redirectUrl = "/doctor";
  else if (user.role === "pharmacist") redirectUrl = "/pharmacist";
  else if (user.role === "admin") redirectUrl = "/admin";
  else if (user.role === "researcher") redirectUrl = "/researcher";

  res.json({
    message: "Logged in",
    role: user.role,
    redirect: redirectUrl
  });
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.send("Logged out successfully!");
  });
});

/* -------- DASHBOARD -------- */

router.get("/dashboard", (req, res) => {
  if (!req.session.userId) return res.send("Please login");
  res.send(`Welcome ${req.session.role}`);
});


/* -------- ROLE ROUTES -------- */
//PATIENT

router.get("/patient", (req, res) => {
  if (!req.session.userId || req.session.role !== "patient") {
    return res.send("Access denied");
  }
  res.send("Patient dashboard");
});


// 📄 View all prescriptions (previous uploads)
router.get("/patient/prescriptions", isPatient, async (req, res) => {
  const prescriptions = await Prescription.find({
    userId: req.session.userId
  });

  res.json(prescriptions.map(p => ({
    id: p._id,
    imageUrl: `http://localhost:5000/${p.image}`,
    drugs: p.drugs || []
  })));
});

// 📄 View single prescription
router.get("/patient/prescription/:id", isPatient, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) return res.send("Not found");

  res.json(prescription);
});

// ✏️ Medication review (edit drugs / add / remove)
router.put("/patient/update-drugs", isPatient, async (req, res) => {
  const { prescriptionId, drugs } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Not found");

  prescription.drugs = drugs;
  await prescription.save();

  res.send("Drugs updated");
});

// ⚠️ Patient-specific interaction analysis
router.get("/patient/interactions/:id", isPatient, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) return res.send("Prescription not found");

  const drugs = prescription.drugs || [];
  let results = [];

  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const d1 = drugs[i].toLowerCase();
      const d2 = drugs[j].toLowerCase();

      interactions.forEach(inter => {
        if (
          (inter.drug1.toLowerCase() === d1 && inter.drug2.toLowerCase() === d2) ||
          (inter.drug1.toLowerCase() === d2 && inter.drug2.toLowerCase() === d1)
        ) {
          results.push(inter);
        }
      });
    }
  }

  let overall = "Safe";
  if (results.some(r => r.severity === "High")) overall = "High Risk";
  else if (results.some(r => r.severity === "Medium")) overall = "Moderate Risk";

  res.json({
    interactions: results,
    overallRisk: overall
  });
});

// 📊 Patient status (pharmacist decision + notes)
router.get("/patient/status/:id", isPatient, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) return res.send("Not found");

  res.json({
    status: prescription.status || "Pending",
    note: prescription.note || "No notes"
  });
});


//DOCTOR

router.get("/doctor/dashboard", isDoctor, (req, res) => {
  res.send("Doctor dashboard");
});

router.post("/doctor/create", isDoctor, async (req, res) => {
  const { drugs } = req.body;

  const prescription = new Prescription({
    userId: req.session.userId,
    drugs
  });

  await prescription.save();

  res.send("Prescription created");
});

router.get("/doctor/prescriptions", isDoctor, async (req, res) => {
  const prescriptions = await Prescription.find({
    userId: req.session.userId
  });

  res.json(prescriptions);
});

router.get("/doctor/all", isDoctor, async (req, res) => {
  const prescriptions = await Prescription.find();

  res.json(prescriptions);
});

router.get("/doctor/suggestions/:id", isDoctor, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);

  if (!prescription) return res.send("Not found");

  res.json({
    suggestions: [
      "Replace Aspirin with Paracetamol"
    ]
  });
});

router.put("/doctor/update", isDoctor, async (req, res) => {
  const { prescriptionId, drugs } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Not found");

  prescription.drugs = drugs;
  await prescription.save();

  res.send("Prescription updated");
});

router.post("/doctor/approve", isDoctor, async (req, res) => {
  const { prescriptionId } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Not found");

  prescription.status = "approved";
  await prescription.save();

  res.send("Prescription approved");
});
//PHARMACIST
router.get("/pharmacist/dashboard", (req, res) => {
  if (!req.session.userId || req.session.role !== "pharmacist") {
    return res.send("Access denied");
  }
  res.send("Pharmacist dashboard");
});

router.get("/pharmacist/queue", isPharmacist, async (req, res) => {
  const prescriptions = await Prescription.find();

  res.json(prescriptions);
});

router.get("/pharmacist/verify/:id", isPharmacist, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);

  if (!prescription) return res.send("Not found");

  res.json(prescription);
});

router.post("/pharmacist/validate", isPharmacist, async (req, res) => {
  const { drugs } = req.body;

  let duplicates = [];
  let seen = new Set();

  drugs.forEach(d => {
    if (seen.has(d.toLowerCase())) {
      duplicates.push(d);
    }
    seen.add(d.toLowerCase());
  });

  res.json({
    duplicates,
    message: duplicates.length ? "Duplicates found" : "Valid"
  });
});

router.get("/pharmacist/risk/:id", isPharmacist, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);

  if (!prescription) return res.send("Not found");

  const drugs = prescription.drugs || [];

  let riskScore = drugs.length * 10;

  res.json({
    riskScore,
    level:
      riskScore > 30 ? "High" :
      riskScore > 10 ? "Medium" : "Low"
  });
});

router.get("/pharmacist/suggestions/:id", isPharmacist, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);

  if (!prescription) return res.send("Not found");

  res.json({
    suggestions: [
      "Consider replacing Aspirin with Paracetamol"
    ]
  });
});

router.post("/pharmacist/decision", isPharmacist, async (req, res) => {
  const { prescriptionId, status } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Not found");

  prescription.status = status; // approved / rejected
  await prescription.save();

  res.send("Decision saved");
});

router.post("/pharmacist/notes", isPharmacist, async (req, res) => {
  const { prescriptionId, note } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Not found");

  prescription.note = note;
  await prescription.save();

  res.send("Note added");
});
//ADMIN ROUTES

router.get("/admin", (req, res) => {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.send("Access denied");
  }
  res.send("Admin dashboard");
});

router.get("/admin/dashboard", isAdmin, (req, res) => {
  res.send("Admin dashboard");
});

router.get("/admin/users", isAdmin, async (req, res) => {
  const users = await User.find();
  res.json(users);
});

router.delete("/admin/users/:id", isAdmin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.send("User deleted");
});

router.put("/admin/users/role", isAdmin, async (req, res) => {
  const { userId, role } = req.body;

  await User.findByIdAndUpdate(userId, { role });

  res.send("Role updated");
});

router.post("/admin/drugs", isAdmin, async (req, res) => {
  const drug = new Drug(req.body);
  await drug.save();
  res.send("Drug added");
});

router.get("/admin/drugs", isAdmin, async (req, res) => {
  const drugs = await Drug.find();
  res.json(drugs);
});

router.get("/admin/logs", isAdmin, async (req, res) => {
  const prescriptions = await Prescription.find();
  res.json(prescriptions);
});

router.get("/admin/reports", isAdmin, async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalPrescriptions = await Prescription.countDocuments();

  res.json({
    totalUsers,
    totalPrescriptions
  });
});

router.get("/admin/settings", isAdmin, (req, res) => {
  res.send("System settings page");
});

//RESEARCHERR


router.get("/researcher/dashboard", isResearcher, (req, res) => {
  res.send("Researcher dashboard");
});

router.get("/researcher/interactions", isResearcher, async (req, res) => {
  const prescriptions = await Prescription.find();

  let allDrugs = [];

  prescriptions.forEach(p => {
    if (p.drugs) {
      allDrugs.push(...p.drugs);
    }
  });

  res.json({
    totalDrugsAnalyzed: allDrugs.length,
    drugs: allDrugs
  });
});

router.get("/researcher/risk", isResearcher, async (req, res) => {
  const prescriptions = await Prescription.find();

  let high = 0, medium = 0, low = 0;

  prescriptions.forEach(p => {
    const drugs = p.drugs || [];

    if (drugs.length > 2) high++;
    else if (drugs.length === 2) medium++;
    else low++;
  });

  res.json({
    highRisk: high,
    mediumRisk: medium,
    lowRisk: low
  });
});

router.get("/researcher/visualization", isResearcher, async (req, res) => {
  const prescriptions = await Prescription.find();

  res.json({
    labels: ["Prescriptions"],
    data: [prescriptions.length]
  });
});

router.get("/researcher/export", isResearcher, async (req, res) => {
  const prescriptions = await Prescription.find();

  const data = prescriptions.map(p => ({
    id: p._id,
    drugs: (p.drugs || []).join(", ")
  }));

  res.json(data);
});

/* -------- UPLOAD -------- */

router.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.session.userId) return res.send("Please login");
  if (!req.file) return res.send("No file uploaded");

  if (req.session.role !== "patient" && req.session.role !== "doctor") {
    return res.send("Only patients and doctors can upload");
  }

  const newPrescription = new Prescription({
    userId: req.session.userId,
    image: req.file.path
  });

  await newPrescription.save();

  res.send("Prescription uploaded");
});

/* -------- GET PRESCRIPTIONS -------- */

router.get("/prescriptions", async (req, res) => {
  if (!req.session.userId) return res.send("Please login");

  const prescriptions = await Prescription.find({
    userId: req.session.userId
  });

  res.json(prescriptions.map(p => ({
    id: p._id,
    imageUrl: `http://localhost:5000/${p.image}`,
    drugs: p.drugs || []
  })));
});

/* -------- SAVE DRUGS -------- */

router.post("/save-drugs", async (req, res) => {
  const { prescriptionId, drugs } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Prescription not found");

  prescription.drugs = drugs;
  await prescription.save();

  res.send("Drugs saved");
});

router.put("/update-drugs", async (req, res) => {
  const { prescriptionId, drugs } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Not found");

  prescription.drugs = drugs;
  await prescription.save();

  res.send("Drugs updated");
});

/* -------- INTERACTIONS -------- */

router.get("/interactions/:id", async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);

  if (!prescription) return res.send("Prescription not found");

  const drugs = prescription.drugs || [];
  let results = [];

  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const d1 = drugs[i].toLowerCase();
      const d2 = drugs[j].toLowerCase();

      interactions.forEach(inter => {
        if (
          (inter.drug1.toLowerCase() === d1 && inter.drug2.toLowerCase() === d2) ||
          (inter.drug1.toLowerCase() === d2 && inter.drug2.toLowerCase() === d1)
        ) {
          results.push(inter);
        }
      });
    }
  }

  let overall = "Safe";
  if (results.some(r => r.severity === "High")) overall = "High Risk";
  else if (results.some(r => r.severity === "Medium")) overall = "Moderate Risk";

  res.json({
    interactions: results,
    overallRisk: overall
  });
});

return router;
};