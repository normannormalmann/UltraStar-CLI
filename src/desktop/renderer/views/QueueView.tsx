import type { FC } from "react";
import type { Song } from "../../shared/ipc-contract.ts";

export const QueueView: FC<{ queue: Song[] }> = () => <h2>Queue</h2>;

export default QueueView;
