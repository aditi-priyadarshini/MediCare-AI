import React from "react";
import { useNav } from "../nav";
import { useSession } from "../session";
import { H1, H2, P, Page, RowLink, Screen } from "../ui";

export function More() {
  const nav = useNav();
  const { user } = useSession();
  return (
    <Page>
      <Screen>
        <H1>More</H1>
        <P soft>{user.email}</P>
        <H2>My health</H2>
        <RowLink title="Health profile" body="Conditions, allergies, contacts" onPress={() => nav.go({ name: "profile" })} />
        <RowLink title="Safety checker" body="Interactions and allergy warnings" onPress={() => nav.go({ name: "safety" })} />
        <H2>Care</H2>
        <RowLink title="Find care" body="Doctors and pharmacies" onPress={() => nav.go({ name: "care" })} />
        <RowLink title="Care sharing" body="Who can see your summary" onPress={() => nav.go({ name: "share" })} />
        <RowLink title="Emergency" body="Call 112 and your emergency summary" onPress={() => nav.go({ name: "emergency" })} />
        <H2>Account</H2>
        <RowLink title="Notifications" onPress={() => nav.go({ name: "notifications" })} />
        <RowLink title="Settings" body="Reminder calls, display, server" onPress={() => nav.go({ name: "settings" })} />
        <P soft small>Diet plans, feedback, uploading records and the admin console are on the website.</P>
      </Screen>
    </Page>
  );
}
