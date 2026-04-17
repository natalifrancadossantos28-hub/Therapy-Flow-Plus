import { Router, type IRouter } from "express";
import healthRouter from "./health";
import professionalsRouter from "./professionals";
import patientsRouter from "./patients";
import appointmentsRouter from "./appointments";
import waitingListRouter from "./waiting-list";
import triagemRouter from "./triagens";
import pontoRouter from "./ponto";
import errorLogsRouter from "./error-logs";
import whatsappRouter from "./whatsapp";
import notificacoesRouter from "./notificacoes";
import contractorsRouter from "./contractors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(professionalsRouter);
router.use(patientsRouter);
router.use(appointmentsRouter);
router.use(waitingListRouter);
router.use(triagemRouter);
router.use(pontoRouter);
router.use(errorLogsRouter);
router.use("/whatsapp", whatsappRouter);
router.use(notificacoesRouter);
router.use(contractorsRouter);

export default router;
