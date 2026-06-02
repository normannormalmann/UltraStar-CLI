import type { FC } from "react";
import { useEffect, useState } from "react";

export const CoverThumb: FC<{ apiId: number }> = ({ apiId }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void window.ultrastar.coverGet(apiId).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [apiId]);
  return src ? (
    <img className="cover-thumb" src={src} alt="" />
  ) : (
    <div className="cover-thumb" />
  );
};

export default CoverThumb;
