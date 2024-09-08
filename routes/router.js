const express = require("express");
const router = express.Router();

const controller = require("../controllers/controller");

router.post("/add", controller.add);
router.post("/spatient", controller.spatient);
router.post("/addtreatment", controller.addtreatment);
router.post("/streatment", controller.streatment);


module.exports = router;
