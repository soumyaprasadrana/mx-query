/** Claude's mxQ badge + mxQuery wordmark. Clicking the badge goes home when `onClick` is passed. */
import { APP_NAME, LOGO_SRC } from "../lib/brand";
import VersionStamp from "./VersionStamp";

export default function Brand({
  onClick,
  title = "Home",
}: {
  onClick?: () => void;
  title?: string;
}) {
  const img = (
    <img src={LOGO_SRC} alt="" className="wiz-logo-img" width={36} height={36} />
  );
  return (
    <>
      {onClick ? (
        <button type="button" className="wiz-logo" onClick={onClick} title={title} aria-label={title}>
          {img}
        </button>
      ) : (
        <span className="wiz-logo" aria-hidden="true">
          {img}
        </span>
      )}
      <span className="wiz-brand-name">{APP_NAME}</span>
      <VersionStamp />
    </>
  );
}
