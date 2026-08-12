import { useState } from "react";
import { useI18n } from "./i18n.jsx";

// تقييم نجوم من 5 مع دعم أنصاف النجوم. القيمة رقم 0..5 بخطوات 0.5
export default function StarRating({ value = 0, onChange, readOnly = false, size = "md" }) {
  const { t } = useI18n();
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;

  return (
    <div className={`stars ${size} ${readOnly ? "readonly" : ""}`} onMouseLeave={() => setHover(0)}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, shown - i));
        return (
          <span className="star-wrap" key={i}>
            <span className="star-bg">★</span>
            <span className="star-fg" style={{ width: `${fill * 100}%` }}>★</span>
            {!readOnly && (
              <>
                <button type="button" className="star-hit left" onMouseEnter={() => setHover(i + 0.5)} onClick={() => onChange(i + 0.5)} aria-label={t("star_of5", { n: i + 0.5 })} />
                <button type="button" className="star-hit right" onMouseEnter={() => setHover(i + 1)} onClick={() => onChange(i + 1)} aria-label={t("star_of5", { n: i + 1 })} />
              </>
            )}
          </span>
        );
      })}
      {!readOnly && value > 0 && (
        <button type="button" className="star-clear" onClick={() => onChange(0)} aria-label={t("clear_rating")}>×</button>
      )}
    </div>
  );
}
