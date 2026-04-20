import { queryDB } from "../dbManager.js";
import { formatNamesSimple } from "./dbUtils.js";

const SETUP_COLUMNS = [
  {
    key: "toe",
    label: "Toe-out",
    current: "CurrentSetupToe",
    best: "BestSetupToe",
    perfect: "PerfectSetupToe",
    parcFerme: "SetupToe"
  },
  {
    key: "camber",
    label: "Camber",
    current: "CurrentSetupCamber",
    best: "BestSetupCamber",
    perfect: "PerfectSetupCamber",
    parcFerme: "SetupCamber"
  },
  {
    key: "antiRollBars",
    label: "Anti-roll bars",
    current: "CurrentSetupAntiRollBars",
    best: "BestSetupAntiRollBars",
    perfect: "PerfectSetupAntiRollBars",
    parcFerme: "SetupAntiRollBars"
  },
  {
    key: "frontWing",
    label: "Front wing angle",
    current: "CurrentSetupFrontWingAngle",
    best: "BestSetupFrontWingAngle",
    perfect: "PerfectSetupFrontWingAngle"
  },
  {
    key: "rearWing",
    label: "Rear wing angle",
    current: "CurrentSetupRearWingAngle",
    best: "BestSetupRearWingAngle",
    perfect: "PerfectSetupRearWingAngle",
    parcFerme: "SetupRearWingAngle"
  }
];

function tableExists(tableName) {
  return !!queryDB(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName],
    "singleValue"
  );
}

function tableColumns(tableName) {
  if (!tableExists(tableName)) {
    return new Set();
  }

  return new Set(
    (queryDB(`PRAGMA table_info(${tableName})`, [], "allRows") || [])
      .map((column) => column[1])
  );
}

function setupTablesExist() {
  return ["Save_Weekend", "Save_CarConfig", "Races", "Player"].every(tableExists);
}

function setupConfigColumnsAvailable() {
  const columns = tableColumns("Save_CarConfig");
  const requiredColumns = ["TeamID", "LoadoutID"];

  for (const column of SETUP_COLUMNS) {
    requiredColumns.push(column.current, column.perfect);
  }

  return requiredColumns.every((column) => columns.has(column));
}

function spacedName(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function weekendTypeLabel(weekendType) {
  switch (Number(weekendType)) {
    case 1:
      return "Sprint";
    case 2:
      return "Race qualifying format";
    default:
      return "Normal";
  }
}

function fetchActiveWeekend() {
  if (!setupTablesExist()) {
    return null;
  }

  const weekendColumns = tableColumns("Save_Weekend");
  const raceColumns = tableColumns("Races");
  const hasTracksTable = tableExists("Races_Tracks");
  const weekendValue = (column) => weekendColumns.has(column) ? `sw.${column}` : "0";
  const raceValue = (column, fallback = "0") => raceColumns.has(column) ? `r.${column}` : fallback;
  const trackNameSelect = hasTracksTable ? "COALESCE(rt.Name, '')" : "''";
  const trackJoin = hasTracksTable ? "LEFT JOIN Races_Tracks rt ON rt.TrackID = r.TrackID" : "";

  const row = queryDB(`
    SELECT
      sw.RaceID,
      ${weekendValue("WeekendStage")},
      ${weekendValue("CurrentStageInnerStep")},
      ${weekendValue("SimulatedP1")},
      ${weekendValue("SimulatedP2")},
      ${weekendValue("SimulatedP3")},
      ${weekendValue("SimulatedQ1")},
      ${weekendValue("SimulatedQ2")},
      ${weekendValue("SimulatedQ3")},
      ${weekendValue("SimulatedSQ1")},
      ${weekendValue("SimulatedSQ2")},
      ${weekendValue("SimulatedSQ3")},
      ${weekendValue("SimulatedSprint")},
      ${weekendValue("SimulatedRace")},
      ${raceValue("SeasonID")},
      ${raceValue("Day")},
      ${raceValue("TrackID")},
      ${raceValue("State")},
      ${raceValue("WeekendType")},
      ${trackNameSelect}
    FROM Save_Weekend sw
    JOIN Races r ON r.RaceID = sw.RaceID
    ${trackJoin}
    LIMIT 1
  `, [], "singleRow");

  if (!row) {
    return null;
  }

  const [
    raceId,
    weekendStage,
    currentStageInnerStep,
    simulatedP1,
    simulatedP2,
    simulatedP3,
    simulatedQ1,
    simulatedQ2,
    simulatedQ3,
    simulatedSQ1,
    simulatedSQ2,
    simulatedSQ3,
    simulatedSprint,
    simulatedRace,
    season,
    day,
    trackId,
    raceState,
    weekendType,
    trackName
  ] = row;

  return {
    raceId: Number(raceId),
    weekendStage: Number(weekendStage),
    currentStageInnerStep: Number(currentStageInnerStep),
    simulatedP1: Number(simulatedP1),
    simulatedP2: Number(simulatedP2),
    simulatedP3: Number(simulatedP3),
    simulatedQ1: Number(simulatedQ1),
    simulatedQ2: Number(simulatedQ2),
    simulatedQ3: Number(simulatedQ3),
    simulatedSQ1: Number(simulatedSQ1),
    simulatedSQ2: Number(simulatedSQ2),
    simulatedSQ3: Number(simulatedSQ3),
    simulatedSprint: Number(simulatedSprint),
    simulatedRace: Number(simulatedRace),
    season: Number(season),
    day: Number(day),
    trackId: Number(trackId),
    raceState: Number(raceState),
    weekendType: Number(weekendType),
    weekendTypeLabel: weekendTypeLabel(weekendType),
    trackName: spacedName(trackName)
  };
}

function isBeforeQualifying(weekend) {
  if (!weekend) return false;

  const qualifyingHasRun =
    weekend.simulatedQ1 === 1 ||
    weekend.simulatedQ2 === 1 ||
    weekend.simulatedQ3 === 1 ||
    weekend.simulatedSQ1 === 1 ||
    weekend.simulatedSQ2 === 1 ||
    weekend.simulatedSQ3 === 1 ||
    weekend.simulatedSprint === 1 ||
    weekend.simulatedRace === 1;

  if (qualifyingHasRun) {
    return false;
  }

  return weekend.weekendStage <= 4;
}

function getPlayerTeamId() {
  return Number(queryDB(`SELECT TeamID FROM Player`, [], "singleValue"));
}

function getDriverNameForLoadout(teamId, loadoutId) {
  const row = queryDB(`
    SELECT bas.FirstName, bas.LastName, bas.StaffID, con.TeamID
    FROM Staff_Contracts con
    JOIN Staff_GameData gam ON gam.StaffID = con.StaffID
    JOIN Staff_BasicData bas ON bas.StaffID = con.StaffID
    WHERE con.TeamID = ?
      AND con.ContractType = 0
      AND con.PosInTeam = ?
      AND gam.StaffType = 0
    LIMIT 1
  `, [teamId, Number(loadoutId) + 1], "singleRow");

  if (!row) {
    return `Car ${Number(loadoutId) + 1}`;
  }

  return formatNamesSimple(row)[0] || `Car ${Number(loadoutId) + 1}`;
}

function toSetupValue(row, column) {
  const value = Number(row?.[column]);
  return Number.isFinite(value) ? value : null;
}

function calculateSetupMatch(row) {
  const matches = SETUP_COLUMNS.map((column) => {
    const current = toSetupValue(row, column.current);
    const perfect = toSetupValue(row, column.perfect);
    if (current === null || perfect === null) {
      return null;
    }
    return Math.max(0, 1 - Math.abs(current - perfect));
  }).filter((value) => value !== null);

  if (!matches.length) {
    return null;
  }

  const average = matches.reduce((sum, value) => sum + value, 0) / matches.length;
  return Math.round(average * 1000) / 10;
}

function mapSetupRow(row) {
  const values = {};

  for (const column of SETUP_COLUMNS) {
    values[column.key] = {
      label: column.label,
      current: toSetupValue(row, column.current),
      perfect: toSetupValue(row, column.perfect)
    };
  }

  const confidence = Number(row.DriverConfidence);

  return {
    loadoutId: Number(row.LoadoutID),
    carNumber: Number(row.LoadoutID) + 1,
    teamId: Number(row.TeamID),
    driverName: getDriverNameForLoadout(Number(row.TeamID), Number(row.LoadoutID)),
    confidencePercent: Number.isFinite(confidence) ? Math.round(confidence * 1000) / 10 : null,
    setupMatchPercent: calculateSetupMatch(row),
    values
  };
}

function fetchPlayerSetupRows(teamId) {
  const rows = queryDB(`
    SELECT *
    FROM Save_CarConfig
    WHERE TeamID = ?
    ORDER BY LoadoutID
  `, [teamId], "allRows") || [];

  const columns = queryDB(`PRAGMA table_info(Save_CarConfig)`, [], "allRows")
    .map((column) => column[1]);

  return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function buildCarConfigAssignments(columns) {
  const assignments = [];

  if (columns.has("DriverConfidence")) {
    assignments.push("DriverConfidence = 1");
  }

  for (const column of SETUP_COLUMNS) {
    if (columns.has(column.current) && columns.has(column.perfect)) {
      assignments.push(`${column.current} = ${column.perfect}`);
    }
    if (columns.has(column.best) && columns.has(column.perfect)) {
      assignments.push(`${column.best} = ${column.perfect}`);
    }
  }

  for (const column of [
    "FeedbackRemainingThisRun",
    "ConfigTimeCarSetup",
    "ConfigTimeTotal",
    "ConfigTimeRemaining"
  ]) {
    if (columns.has(column)) {
      assignments.push(`${column} = 0`);
    }
  }

  return assignments;
}

function updateParcFermeSetup(teamId, car, carConfigColumns) {
  if (!tableExists("Save_CarConfig_ParcFerme")) {
    return;
  }

  const parcFermeColumns = tableColumns("Save_CarConfig_ParcFerme");
  if (!parcFermeColumns.has("TeamID") || !parcFermeColumns.has("LoadoutID")) {
    return;
  }

  const assignments = [];
  const params = [];

  for (const column of SETUP_COLUMNS) {
    if (!column.parcFerme) continue;
    if (!parcFermeColumns.has(column.parcFerme) || !carConfigColumns.has(column.perfect)) continue;

    assignments.push(`${column.parcFerme} = (
      SELECT ${column.perfect}
      FROM Save_CarConfig
      WHERE TeamID = ?
        AND LoadoutID = ?
    )`);
    params.push(teamId, car.loadoutId);
  }

  if (!assignments.length) {
    return;
  }

  queryDB(`
    UPDATE Save_CarConfig_ParcFerme
    SET ${assignments.join(", ")}
    WHERE TeamID = ?
      AND LoadoutID = ?
  `, [...params, teamId, car.loadoutId + 1], "run");
}

export function fetchCurrentWeekendSetup() {
  const weekend = fetchActiveWeekend();

  if (!weekend) {
    return {
      available: false,
      reason: "No active race weekend was found in this save.",
      weekend: null,
      cars: []
    };
  }

  if (weekend.raceState !== 1) {
    return {
      available: false,
      reason: "Setup editing is available only while a race weekend is in progress.",
      weekend,
      cars: []
    };
  }

  if (!isBeforeQualifying(weekend)) {
    return {
      available: false,
      reason: "Qualifying has already started or this weekend is past practice.",
      weekend,
      cars: []
    };
  }

  if (!setupConfigColumnsAvailable()) {
    return {
      available: false,
      reason: "This save does not expose supported car setup data.",
      weekend,
      cars: []
    };
  }

  const playerTeamId = getPlayerTeamId();
  const setupRows = fetchPlayerSetupRows(playerTeamId);

  if (!setupRows.length) {
    return {
      available: false,
      reason: "No player-team car setup rows were found for this weekend.",
      weekend,
      cars: []
    };
  }

  return {
    available: true,
    reason: null,
    weekend,
    teamId: playerTeamId,
    cars: setupRows.map(mapSetupRow)
  };
}

export function optimiseCurrentWeekendSetup() {
  const setup = fetchCurrentWeekendSetup();

  if (!setup.available) {
    return {
      ok: false,
      reason: setup.reason,
      setup
    };
  }

  const teamId = setup.teamId;
  const carConfigColumns = tableColumns("Save_CarConfig");
  const assignments = buildCarConfigAssignments(carConfigColumns);
  let updated = 0;

  if (!assignments.length) {
    return {
      ok: false,
      reason: "This save does not expose supported car setup data.",
      setup
    };
  }

  for (const car of setup.cars) {
    queryDB(`
      UPDATE Save_CarConfig
      SET ${assignments.join(", ")}
      WHERE TeamID = ?
        AND LoadoutID = ?
    `, [teamId, car.loadoutId], "run");

    updateParcFermeSetup(teamId, car, carConfigColumns);

    updated += 1;
  }

  return {
    ok: true,
    updated,
    setup: fetchCurrentWeekendSetup()
  };
}
