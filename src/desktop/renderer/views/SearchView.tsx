import type { FC } from "react";
import type { AppStatus, DownloadedEntry } from "../../shared/ipc-contract.ts";

export const SearchView: FC<{
  downloaded: DownloadedEntry[];
  status: AppStatus;
}> = () => <h2>Suche</h2>;

export default SearchView;
