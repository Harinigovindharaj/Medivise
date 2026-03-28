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
const axios = require("axios");

// Generate drug pairs
function generatePairs(drugs) {
  const pairs = [];
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      pairs.push([drugs[i], drugs[j]]);
    }
  }
  return pairs;
}

router.post("/patient/analyze/:id", isPatient ,async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);
    if (!prescription) return res.send("Prescription not found");

    const drugs = prescription.drugs || [];

    if (drugs.length < 2) {
      return res.json({ message: "Not enough drugs" });
    }

    const pairs = generatePairs(drugs);

    const promises = pairs.map(([drug1, drug2]) => {
      return axios.post("http://127.0.0.1:8000/analyze", {
        drug1,
        drug2,
        drug1_class: "NSAID",
        drug2_class: "NSAID",
        age: 30,
        condition: "general",
        dosage1: 500,
        dosage2: 200
      })
      .then(res => ({
        drug1,
        drug2,
        analysis: res.data
      }))
      .catch(() => ({
        drug1,
        drug2,
        error: "ML failed"
      }));
    });

    const results = await Promise.all(promises);

    // Overall risk
    let overallRisk = "Low";

    if (results.some(r => r.analysis?.severity === "high")) {
      overallRisk = "High";
    } else if (results.some(r => r.analysis?.severity === "moderate")) {
      overallRisk = "Moderate";
    }
    prescription.analysis = {
      interactions: results,
      overallRisk
    };

    await prescription.save();

    res.json({
      drugs,
      interactions: results,
      overallRisk
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.get("/patient/analysis/:id", isPatient, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);

  if (!prescription) return res.send("Not found");

  res.json({
    drugs: prescription.drugs,
    analysis: prescription.analysis
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


const PDFDocument = require("pdfkit");

router.get("/patient/report/:id", async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) return res.status(404).send("Not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=report.pdf");

  doc.pipe(res);

  doc.fontSize(18).text("Medivise Report", { align: "center" });

  doc.moveDown();
  doc.text("Drugs: " + prescription.drugs.join(", "));

  doc.end();
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
const { exec } = require("child_process");

router.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.session.userId) return res.send("Please login");
  if (!req.file) return res.send("No file uploaded");

  const imagePath = req.file.path;

  exec(`python src/ocr_runner.py "${imagePath}"`, async (error, stdout) => {
    if (error) {
      console.error(error);
      return res.status(500).send("OCR failed");
    }

    let drugs = [];

    try {
      drugs = JSON.parse(stdout);
    } catch {
      console.error("OCR JSON parse failed:", stdout);
    }

    // Save prescription
    const prescription = new Prescription({
      userId: req.session.userId,
      image: imagePath,
      drugs
    });

    await prescription.save();

    // ONLY RETURN DRUGS (NO ML)
    res.json({
      prescriptionId: prescription._id,
      drugs
    });
  });
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

// router.get("/interactions/:id", async (req, res) => {
//   const prescription = await Prescription.findById(req.params.id);

//   if (!prescription) return res.send("Prescription not found");

//   const drugs = prescription.drugs || [];
//   let results = [];

//   for (let i = 0; i < drugs.length; i++) {
//     for (let j = i + 1; j < drugs.length; j++) {
//       const d1 = drugs[i].toLowerCase();
//       const d2 = drugs[j].toLowerCase();

//       interactions.forEach(inter => {
//         if (
//           (inter.drug1.toLowerCase() === d1 && inter.drug2.toLowerCase() === d2) ||
//           (inter.drug1.toLowerCase() === d2 && inter.drug2.toLowerCase() === d1)
//         ) {
//           results.push(inter);
//         }
//       });
//     }
//   }

//   let overall = "Safe";
//   if (results.some(r => r.severity === "High")) overall = "High Risk";
//   else if (results.some(r => r.severity === "Medium")) overall = "Moderate Risk";

//   res.json({
//     interactions: results,
//     overallRisk: overall
//   });
// });

return router;
};