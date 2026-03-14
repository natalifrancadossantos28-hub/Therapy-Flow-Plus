import { Router, type IRouter } from "express";
import healthRouter from "./health";
import professionalsRouter from "./professionals";
import patientsRouter from "./patients";
import appointmentsRouter from "./appointments";
import waitingListRouter from "./waiting-list";

const router: IRouter = Router();

router.use(healthRouter);
router.use(professionalsRouter);
router.use(patientsRouter);
router.use(appointmentsRouter);
router.use(waitingListRouter);

export default router;
