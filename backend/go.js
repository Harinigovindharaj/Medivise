
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

module.exports = (User, Prescription, upload, interactions, Drug) => {
    

/* -------- AUTH -------- */

// Signup
router.post("/signup", async (req, res) => {
  const { email, password, role } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) return res.send("User already exists");

  const hashed = await bcrypt.hash(password, 10);

  const user = new User({ email, password: hashed, role: role.toLowerCase() });
  await user.save();

  res.send("User registered");
});

// Login
router.post("/login", async (req, res) => {
  const { email, password, role } = req.body; // include role

  const user = await User.findOne({ email });
  if (!user) return res.send("User not found");

  // check role match
  if (user.role !== role.toLowerCase()) {
    return res.status(403).send("Invalid role selected");
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send("Wrong password");

  req.session.userId = user._id;
  req.session.role = user.role;

  res.json({
    message: "Logged in",
    role: user.role,
    redirect: `/${user.role}/${user.role}.html`
  });
});

// Logout
router.get("/logout", (req, res) => {
  console.log('logout')
  req.session.destroy(() => {
    res.redirect("/index.html");
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


// View all prescriptions (previous uploads)
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

//  View single prescription
router.get("/patient/prescription/:id", isPatient, async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) return res.send("Not found");

  res.json(prescription);
});

// Medication review (edit drugs / add / remove)
router.put("/patient/update-drugs", isPatient, async (req, res) => {
  const { prescriptionId, drugs } = req.body;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return res.send("Not found");

  prescription.drugs = drugs;
  await prescription.save();

  res.send("Drugs updated");
});

// Patient-specific interaction analysis
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

// Patient status (pharmacist decision + notes)
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
  res.setHeader("Content-Disposition", "attachment; filename=Medivise_Report.pdf");

  doc.pipe(res);

  // TITLE
  doc.fontSize(20).text("MediVise Clinical Report", { align: "center" });
  doc.moveDown();

  // DRUGS
  doc.fontSize(12).text("Medications:");
  doc.text(prescription.drugs.join(", "));
  doc.moveDown();

  const interactions = prescription.analysis?.interactions || [];

  // RISK SUMMARY
  doc.fontSize(14).text("Risk Summary:");
  doc.text("Overall Risk: " + (prescription.analysis?.overallRisk || "Unknown"));
  doc.moveDown();

  // INTERACTIONS
  doc.fontSize(14).text("Detected Interactions:");
  doc.moveDown();

  interactions.forEach((i, index) => {
    const a = i.analysis || {};

    doc.fontSize(12).text(
      `${index + 1}. ${i.drug1} + ${i.drug2}`
    );

    doc.text(`   Severity: ${a.severity || "N/A"}`);
    doc.text(`   Risk Score: ${(a.risk_score || 0).toFixed(2)}`);

    // Factors
    if (a.factors?.length) {
      doc.text("   Key Factors:");
      a.factors.slice(0, 3).forEach(f => {
        doc.text(`     - ${f[0]} (${f[1].toFixed(2)})`);
      });
    }

    // Food warnings
    if (a.food_warnings?.length) {
      doc.text("   Food Warnings:");
      doc.text("     " + a.food_warnings.join(", "));
    }

    // Alternatives
    if (a.alternatives?.length) {
      doc.text("   Suggested Alternatives:");
      a.alternatives.forEach(alt => {
        doc.text(`     - ${alt}`);
      });
    }

    doc.moveDown();
  });

  // FOOTER
  doc.moveDown();
  doc.fontSize(10).text(
    "Consult a healthcare professional before making any medication changes.",
    { align: "center" }
  );

  doc.end();
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
  if (!Drug) return res.json([]);
  const drugs = await Drug.find();
  res.json(drugs);
});

router.get("/admin/logs", isAdmin, async (req, res) => {
  const prescriptions = await Prescription.find().sort({ createdAt: -1 });
  res.json(prescriptions);
});

router.post("/admin/settings", isAdmin, async (req, res) => {
  const { apiKey, backupInterval } = req.body;

  // For now just log (or store in DB later)
  console.log("Settings updated:", req.body);

  res.send("Settings saved");
});

router.delete("/admin/drugs/:id", isAdmin, async (req, res) => {
  try {
    if (!Drug) return res.status(500).send("Drug model not available");
    await Drug.findByIdAndDelete(req.params.id);
    res.send("Drug deleted");
  } catch (err) {
    res.status(500).send("Error deleting drug");
  }
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

//RESEARCHER


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
  console.log("UPLOAD HIT", req.file, req.session.userId);
  if (!req.session.userId) {
    console.log("NOT LOGGED IN");
    return res.send("Please login");
  }
  if (!req.file) {
    console.log("NO FILE UPLOADED");
    return res.send("No file uploaded");
  }
  const imagePath = req.file.path;
  const path = require("path");

  const scriptPath = path.join(__dirname, "../ml-model/ocr_runner.py");

  exec(`python "${scriptPath}" "${imagePath}"`, async (error, stdout) => {
    if (error) {
      console.error(error);
      console.log("OCR failed");
      return res.status(500).send("OCR failed");
    }

    let drugs = [];

    try {
      drugs = JSON.parse(stdout);
    } catch {
      console.log("OCR JSON parse failed");
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
    console.log("DRUGS:", drugs);
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
