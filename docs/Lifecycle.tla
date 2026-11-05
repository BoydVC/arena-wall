---- MODULE Lifecycle ----
EXTENDS FiniteSets

\* Structural admission graph for one card.
\* Guards are applied in Next and are not part of Allowed.
\* This set is checked against docs/lifecycle.md by the unit tests.

CONSTANTS specOk, humanOk

Lanes == {"idea", "spec", "seats", "verify", "draft_pr", "merged", "parked"}

Allowed == {
    <<"idea", "idea">>,
    <<"idea", "spec">>,
    <<"idea", "parked">>,
    <<"spec", "spec">>,
    <<"spec", "seats">>,
    <<"spec", "parked">>,
    <<"seats", "seats">>,
    <<"seats", "spec">>,
    <<"seats", "verify">>,
    <<"seats", "parked">>,
    <<"verify", "verify">>,
    <<"verify", "draft_pr">>,
    <<"verify", "parked">>,
    <<"draft_pr", "draft_pr">>,
    <<"draft_pr", "merged">>,
    <<"draft_pr", "parked">>,
    <<"merged", "merged">>,
    <<"parked", "parked">>,
    <<"parked", "idea">>
}

VARIABLE lane

TypeOK == lane \in Lanes

Init == lane = "idea"

\* Self-loops are allowed and change nothing.
Stay == lane' = lane /\ <<lane, lane>> \in Allowed

Enter(next) == <<lane, next>> \in Allowed /\ lane' = next

\* spec -> seats requires specOk. draft_pr -> merged requires humanOk.
\* Blocked guards leave the lane unchanged.
Next ==
  \/ Stay
  \/ Enter("spec") /\ lane = "idea"
  \/ Enter("parked") /\ lane \in {"idea", "spec", "seats", "verify", "draft_pr"}
  \/ Enter("seats") /\ lane = "spec" /\ specOk
  \/ Enter("spec") /\ lane = "seats"
  \/ Enter("verify") /\ lane = "seats"
  \/ Enter("draft_pr") /\ lane = "verify"
  \/ Enter("merged") /\ lane = "draft_pr" /\ humanOk
  \/ Enter("idea") /\ lane = "parked"

\* Entering merged without humanOk is not a Next step.
MergeSafe == lane = "merged" => humanOk

====
