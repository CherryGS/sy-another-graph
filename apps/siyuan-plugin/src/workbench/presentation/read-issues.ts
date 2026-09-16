import { t } from "../../shared/i18n/runtime";
import type { ReadIssue, ReadIssueCode } from "../../core/diagnostics/read-issues";
const definitions: Record<
  ReadIssueCode,
  {
    title: string;
    summary: (count: number) => string;
    impact: string;
    suggestion: string;
  }
> = {
  "snapshot-changed": {
    get title() {
      return t("text.dataChangedWhileReading");
    },
    summary: () => t("text.blocksOrReferencesChangedDuringReadingThePaginated"),
    get impact() {
      return t("text.thisReadIsNotAnAtomicSnapshotRecently");
    },
    get suggestion() {
      return t("text.waitForEditingSynchronizationOrIndexingToFinish");
    },
  },
  "reference-endpoints": {
    get title() {
      return t("text.missingReferenceEndpoints");
    },
    summary: (n) => t("text.omittedReferencesWithUnavailableEndpointsValue", { p0: n }),
    get impact() {
      return t("text.theseReferencesWereOmittedTheirEndpointsAreMissing");
    },
    get suggestion() {
      return t("text.openTheAvailableSourceAndCheckTheTarget");
    },
  },
  "database-identifier": {
    get title() {
      return t("text.unrecognizedDatabaseContainer");
    },
    summary: (n) => t("text.databaseBlocksWithoutARecognizableLogicalDatabaseId", { p0: n }),
    get impact() {
      return t("text.theseContainersRemainInTheGraphButTheir");
    },
    get suggestion() {
      return t("text.openTheSourceAndCheckItsDataAv");
    },
  },
  "database-read": {
    get title() {
      return t("text.incompleteDatabaseRead");
    },
    summary: (n) => t("text.databasesThatCouldNotBeReadCompletelyValue", { p0: n }),
    get impact() {
      return t("text.failedDatabasesAndTheirItemsAndLinksWere");
    },
    get suggestion() {
      return t("text.checkTheApiErrorOrFirstInvalidField");
    },
  },
  "database-budget": {
    get title() {
      return t("text.databaseReadLimitReached");
    },
    summary: () => t("text.theDatabaseReadLimitWasReachedDatabaseRelationships"),
    get impact() {
      return t("text.databasesOrRelationsExceedingTheBudgetWereOmitted");
    },
    get suggestion() {
      return t("text.checkTheReportedLimitDisplayFiltersDoNot");
    },
  },
  "database-bindings": {
    get title() {
      return t("text.missingBoundBlocks");
    },
    summary: (n) => t("text.databaseItemsWhoseBoundBlocksAreMissingFrom", { p0: n }),
    get impact() {
      return t("text.realItemsAndMembershipRelationsRemainOnlyUnavailable");
    },
    get suggestion() {
      return t("text.openTheDatabaseSourceAndCheckTheBound");
    },
  },
  "database-relations": {
    get title() {
      return t("text.missingDatabaseRelationEndpoints");
    },
    summary: (n) => t("text.databaseFieldRelationsWithUnavailableItemEndpointsValue", { p0: n }),
    get impact() {
      return t("text.theseFieldRelationsWereOmittedMissingItemsAre");
    },
    get suggestion() {
      return t("text.checkTheSourceAndTargetItemsAndWhether");
    },
  },
};

export function readIssueText(issue: ReadIssue) {
  const definition = definitions[issue.code];
  return { ...issue, ...definition, summary: definition.summary(issue.count) };
}
