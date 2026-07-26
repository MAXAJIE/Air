import { useT } from "@/i18n";
import { scorePassword } from "@/lib/password-strength";

/** zxcvbn strength readout shared with the sign-up form. */
export function PasswordMeter({ password, userInputs = [] }: { password: string; userInputs?: string[] }) {
  const t = useT();
  if (!password) return null;
  const report = scorePassword(password, userInputs);
  const labels = [
    t("pw.veryWeak"),
    t("pw.weak"),
    t("pw.fair"),
    t("pw.strong"),
    t("pw.veryStrong"),
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1" role="presentation">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= report.score ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("pw.strength")}: {labels[report.score]} · {t("pw.crackTime")}: {report.crackTime}
      </p>
      {report.warning && <p className="text-xs text-muted-foreground">{report.warning}</p>}
      {report.suggestions.slice(0, 2).map((s) => (
        <p key={s} className="text-xs text-muted-foreground">
          {s}
        </p>
      ))}
    </div>
  );
}

