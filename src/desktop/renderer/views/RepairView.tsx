import type { FC } from "react";
import type { AppStatus } from "../../shared/ipc-contract.ts";

export const RepairView: FC<{ status: AppStatus }> = () => <h2>Reparatur</h2>;

export default RepairView;
