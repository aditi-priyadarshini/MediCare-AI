"use client";

import { useParams, useRouter } from "next/navigation";
import { BookingForm } from "@/components/care/BookingForm";
import { FormPage } from "@/components/ui/FormPage";
import { LinkButton } from "@/components/ui/LinkButton";
import { Alert, PageLoading } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api-client";
import { capitalise, type Doctor } from "@/lib/care";
import { useAsync } from "@/lib/hooks";

export default function BookAppointmentPage() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const router = useRouter();
  const toast = useToast();
  const doctor = useAsync(() => api<Doctor>(`/doctors/${encodeURIComponent(doctorId)}`), [doctorId]);

  if (doctor.loading && !doctor.data) return <PageLoading label="Loading doctor" />;

  return (
    <FormPage
      title="Request an appointment"
      description={doctor.data ? `With ${doctor.data.display_name}` : undefined}
      backHref="/care?tab=doctors"
      backLabel="Find care"
    >
      {!doctor.data ? (
        <div className="space-y-3">
          <Alert tone="danger" title="Could not load this doctor">
            {doctor.error ? errorMessage(doctor.error) : "Go back and search again."}
          </Alert>
          <LinkButton href="/care?tab=doctors" variant="secondary">
            Back to Find care
          </LinkButton>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg bg-mint-100 p-4 text-sm">
            <p className="font-semibold text-ink">{doctor.data.display_name}</p>
            {doctor.data.clinic_name && <p className="text-ink-soft">{doctor.data.clinic_name}</p>}
            {doctor.data.specialties.length > 0 && (
              <p className="text-ink-soft">{doctor.data.specialties.map(capitalise).join(", ")}</p>
            )}
          </div>
          <BookingForm
            doctor={doctor.data}
            onClose={() => router.push("/care?tab=doctors")}
            onDone={(a) => {
              toast.show(`${a.status_text} You can see it under Appointments.`, a.status === "sent" ? "success" : "info");
              router.push("/care?tab=appointments");
            }}
          />
        </div>
      )}
    </FormPage>
  );
}
