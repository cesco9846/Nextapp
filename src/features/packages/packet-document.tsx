"use client";
import {
  sessionLabels,
  type PackageContent,
  type Professional,
} from "@/lib/packages";
export function PacketDocument({
  content,
  professional,
  clientName,
  details,
  answers,
}: {
  content: PackageContent;
  professional: Professional;
  clientName: string;
  details: {
    date_of_birth: string;
    birthplace: string;
    session_kind: keyof typeof sessionLabels;
  };
  answers?: Record<string, boolean | string>;
}) {
  return (
    <div className="space-y-7 text-sm leading-relaxed">
      <section>
        <h2 className="text-xl">{content.title}</h2>
        <p className="mt-3">
          {clientName} · {sessionLabels[details.session_kind]}
          <br />
          Nata il {details.date_of_birth} a {details.birthplace}
        </p>
        <p className="mt-3">
          {professional.legal_name} · {professional.tax_id}
          <br />
          {professional.address}
          <br />
          {professional.email} · {professional.phone}
        </p>
      </section>
      <section>
        <h3 className="text-lg">Informazioni sul trattamento</h3>
        <p className="mt-3 whitespace-pre-wrap">{content.description}</p>
        <p className="mt-4 whitespace-pre-wrap">
          {content.treatment_statement}
        </p>
      </section>
      {answers && (
        <section>
          <h3 className="text-lg">Le risposte da verificare</h3>
          <p className="mt-3 whitespace-pre-wrap">{content.introduction}</p>
          <dl className="mt-4 divide-y">
            {content.questions.map((q) => (
              <div key={q.id} className="py-4">
                <dt className="font-medium">{q.label}</dt>
                <dd className="mt-2">
                  {answers[q.id] === true
                    ? "Sì · da approfondire con l’operatrice"
                    : answers[q.id] === false
                      ? "No"
                      : typeof answers[q.id] === "string"
                        ? answers[q.id]
                        : "Non compilata (facoltativa)"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section>
        <h3 className="text-lg">Indicazioni post-trattamento</h3>
        <p className="mt-3 whitespace-pre-wrap">{content.aftercare}</p>
      </section>
      <section>
        <h3 className="text-lg">Informativa privacy</h3>
        <p className="mt-3">
          Titolare: {professional.data_controller}
          {professional.pec ? ` · PEC: ${professional.pec}` : ""}
        </p>
        <p className="mt-3 whitespace-pre-wrap">{content.privacy_notice}</p>
      </section>
    </div>
  );
}
