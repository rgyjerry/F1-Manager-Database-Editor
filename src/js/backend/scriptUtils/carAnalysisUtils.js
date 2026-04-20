import * as carConstants from './carConstants.js';
import { queryDB } from '../dbManager.js';
import { manage_engine_change } from './editTeamUtils.js';



/**
 * Devuelve las mejores piezas para cada equipo.
 * @param {boolean} customTeam - si es true, incluye el equipo 32 además de 1..10
 */
export function getBestParts(customTeam = false) {
    const teams = {};
    // Creamos la lista de equipos
    const teamList = customTeam
        ? [...Array(10).keys()].map(i => i + 1).concat(32) // 1..10 y 32
        : [...Array(10).keys()].map(i => i + 1);          // 1..10

    for (const teamId of teamList) {
        teams[teamId] = getPartsFromTeam(teamId);
    }
    return teams;
}

/**
 * Obtiene TODAS las piezas (varias designs) de un equipo
 * (Como en Python: get_all_parts_from_team)
 */
export function getAllPartsFromTeam(teamId) {
    // Obtenemos Day y Season
    const [day, currentSeason] = queryDB(
        "SELECT Day, CurrentSeason FROM Player_State",
        [], "singleRow"
    ) || [0, 0];


    const partsDict = {};

    // Ej. en Python, PartType iba de 3..8
    for (let j = 3; j < 9; j++) {
        const sql = `
          SELECT 
            d.DesignID,
            d.DayCreated,
            d.DayCompleted, 
            (
              SELECT r.TrackID 
              FROM Races r 
              WHERE r.Day >= d.DayCompleted 
              ORDER BY r.Day ASC 
              LIMIT 1
            ) AS TrackID
          FROM Parts_Designs d
          WHERE 
            d.PartType = ?
            AND d.TeamID = ?
            AND d.ValidFrom = ?
            AND d.DayCompleted > 0
        `;
        let designs = queryDB(sql, [j, teamId, currentSeason], "allRows");

        // Para cada design, agregamos info extra: equipped_1, equipped_2, n_parts
        designs = designs.map(designRow => {
            // designRow => [ DesignID, DayCreated, DayCompleted, TrackID ]
            const [designID, dayCreated, dayCompleted, trackID] = designRow;

            // Vemos si está equipado en loadout 1
            const equipped1 = queryDB(`
            SELECT DesignID
            FROM Parts_CarLoadout
            WHERE TeamID = ?
              AND PartType = ?
              AND LoadoutID = 1
          `, [teamId, j], "singleValue");
            let eq1 = (equipped1 === designID) ? 1 : 0;

            // Equipado en loadout 2?
            const equipped2 = queryDB(`
            SELECT DesignID
            FROM Parts_CarLoadout
            WHERE TeamID = ?
              AND PartType = ?
              AND LoadoutID = 2
          `, [teamId, j], "singleValue");
            let eq2 = (equipped2 === designID) ? 1 : 0;

            // Número de partes (items) construidas
            const nParts = queryDB(`
            SELECT COUNT(*)
            FROM Parts_Items
            WHERE DesignID = ?
              AND BuildWork = ?
          `, [designID, carConstants.standardBuildworkPerPart[j]], "singleValue") || 0;

            // Devolvemos un nuevo array con toda la info
            return [
                designID,      // 0
                dayCreated,    // 1
                dayCompleted,  // 2
                trackID,       // 3
                eq1,           // 4
                eq2,           // 5
                nParts         // 6
            ];
        });

        // Asignamos a partsDict[ parts[j] ] = designs
        // Asumiendo que 'parts[j]' existe. Ajusta si es distinto
        partsDict[carConstants.parts[j]] = designs;
    }

    return partsDict;
}

/**
 * Obtiene las piezas "mejores" (MAX(DesignID)) para un equipo y su season actual
 * (Similar a get_parts_from_team en el Python original)
 */
export function getPartsFromTeam(teamId) {
    // Day, Season
    const [day, season] = queryDB(
        "SELECT Day, CurrentSeason FROM Player_State",
        [], "singleRow"
    ) || [0, 0];

    const designs = {};
    // En Python, j va de 3..8 => motor = 0
    for (let j = 3; j < 9; j++) {
        const row = queryDB(`
          SELECT MAX(DesignID)
          FROM Parts_Designs
          WHERE PartType = ?
            AND TeamID = ?
            AND ValidFrom = ?
            AND (DayCompleted > 0 OR DayCreated < 0)
        `, [j, teamId, season], "allRows");
        designs[j] = row;
    }

    // engine:
    const engine = queryDB(`
        SELECT MAX(DesignID)
        FROM Parts_Designs
        WHERE PartType = 0
          AND TeamID = ?
      `, [teamId], "allRows");
    designs[0] = engine;

    return designs;
}

/**
 * Obtiene las mejores piezas hasta un día concreto (versión con day param)
 * (Similar a get_best_parts_until en el Python original)
 */
export function getBestPartsUntil(day, customTeam = false) {
    // Day, season
    const [dayCur, season] = queryDB(`
        SELECT Day, CurrentSeason 
        FROM Player_State
      `, [], "singleRow") || [0, 0];

    const teamList = customTeam
        ? [...Array(10).keys()].map(i => i + 1).concat(32)
        : [...Array(10).keys()].map(i => i + 1);

    const teams = {};
    for (const t of teamList) {
        const designs = {};
        for (let j = 3; j < 9; j++) {
            const row = queryDB(`
            SELECT MAX(DesignID)
            FROM Parts_Designs
            WHERE PartType = ?
              AND TeamID = ?
              AND ValidFrom = ?
              AND ((DayCompleted > 0 AND DayCompleted <= ?) OR DayCreated < 0)
          `, [j, t, season, day], "allRows");
          designs[j] = row;
        }
        // engine
        const engine = queryDB(`
          SELECT MAX(DesignID)
          FROM Parts_Designs
          WHERE PartType = 0
            AND TeamID = ?
        `, [t], "allRows");
        designs[0] = engine;

        teams[t] = designs;
    }
    return teams;
}

/**
 * Devuelve un diccionario con los valores de stats (PartStat -> Value)
 * de cada parte (partType).
 * (get_car_stats en el Python original)
 */
export function getCarStats(designDict) {
    const statsValues = {};
    for (const part in designDict) {

        const designInfo = designDict[part][0];
        const designID = (designInfo && designInfo.length) ? designInfo[0] : null;

        if (designID !== null) {
            const rows = queryDB(`
            SELECT PartStat, Value
            FROM Parts_Designs_StatValues
            WHERE DesignID = ?
          `, [designID], "allRows");
            // rows => [ [PartStat, Value], [PartStat, Value], ... ]
            const tmp = {};
            for (const [stat, val] of rows) {
                tmp[stat] = Math.round(val * 1000) / 1000; // round to 3 decimals
            }
            statsValues[part] = tmp;
        } else {
            const zeroStats = {};
            for (const stat of carConstants.defaultPartsStats[part]) {
                zeroStats[stat] = 0;
            }
            statsValues[part] = zeroStats;
        }
    }
    return statsValues;
}

export function getTyreDegStats(designDict) {
    const statsValues = {};
    //only part 4 and 8
    const tyreDegDict = {4: designDict[4], 8: designDict[8]};
    for (const part in tyreDegDict) {
        const designInfo = tyreDegDict[part][0];
        const designID = (designInfo && designInfo.length) ? designInfo[0] : null;

        if (designID !== null) {
            const rows = queryDB(`
            SELECT PartStat, Value
            FROM Parts_Designs_StatValues
            WHERE DesignID = ?
          `, [designID], "allRows");
            // rows => [ [PartStat, Value], [PartStat, Value], ... ]
            const tmp = {};
            for (const [stat, val] of rows) {
                tmp[stat] = Math.round(val * 1000) / 1000; // round to 3 decimals
            }
            statsValues[part] = tmp;
        } else {
            const zeroStats = {};
            for (const stat of carConstants.defaultPartsStats[part]) {
                zeroStats[stat] = 0;
            }
            statsValues[part] = zeroStats;
        }
    }
    return statsValues;
}

export function updateTyreDegStats(designDictTeamReceiver, designDictTeamGiver, teamReceiver, teamGiver) {
    //only part 4 and 8
    const reducedDesignDictTeamReceiver = {4: designDictTeamReceiver[4][0][0], 8: designDictTeamReceiver[8][0][0]};
    for (const part in reducedDesignDictTeamReceiver){
        let designID = reducedDesignDictTeamReceiver[part];
        let newTyreDegStat = designDictTeamGiver[part][2];
        let newTyreDegUnitValue = carConstants.valueToUnitValue[2](newTyreDegStat);
        queryDB(`
            UPDATE Parts_Designs_StatValues
            SET Value = ?, UnitValue = ?
            WHERE DesignID = ? AND PartStat = 2
        `, [newTyreDegStat, newTyreDegUnitValue, designID], 'run');

        queryDB(`UPDATE Parts_TeamExpertise
            SET Expertise = ?
            WHERE TeamID = ?
                AND PartType = ?
                AND PartStat = 2
        `, [newTyreDegStat, teamReceiver, part], 'run');
    }
}

export function applyExpertiseBoost(boost, team) {
    //multiply expertise for every stat for every part of the team by the boost
    queryDB(`
        UPDATE Parts_TeamExpertise
        SET Expertise = Expertise * ?
        WHERE TeamID = ?
    `, [boost, team], 'run');
}

export function applyBoostToCarStats(designDict, boost, team) {
    const statsValues = {};
    for (const part in designDict) {

        const designInfo = designDict[part][0];
        const designID = (designInfo && designInfo.length) ? designInfo[0] : null;

        if (designID !== null) {
            const rows = queryDB(`
            SELECT PartStat, Value, UnitValue
            FROM Parts_Designs_StatValues
            WHERE DesignID = ?
          `, [designID], "allRows");
            const tmp = {};
            for (const [stat, val, unitVal] of rows) {
                if (stat !== 15) {
                  let newUnitVal = applyScaledBoostToStatValue(unitVal, stat, boost);
                  let newVal = carConstants.unitValueToValue[stat](newUnitVal);
        
                //   console.log(
                //     `Old UnitValue: ${unitVal}, New UnitValue: ${newUnitVal} | ` +
                //     `Old Value: ${val}, New Value: ${newVal} | Part: ${part} | Stat: ${stat} | Team: ${team}`
                //   );

                  queryDB(
                    `UPDATE Parts_Designs_StatValues
                     SET UnitValue = ?, Value = ?
                     WHERE DesignID = ? AND PartStat = ?`, [newUnitVal, newVal, designID, stat], 'run'
                  );

                  queryDB(`
                    UPDATE Parts_TeamExpertise
                    SET Expertise = ?
                    WHERE TeamID = ?
                        AND PartType = ?
                        AND PartStat = ?
                    `, [newVal, team, part, stat], 'run');

                  tmp[stat] = Math.round(newVal * 1000) / 1000; // redondeo a 3 decimales
                }
              }
            statsValues[part] = tmp;
        } else {
            const zeroStats = {};
            for (const stat of carConstants.defaultPartsStats[part]) {
                zeroStats[stat] = 0;
            }
            statsValues[part] = zeroStats;
        }
    }
    return statsValues;
}

function applyScaledBoostToStatValue(originalValue, statID, boost) {
    // 1) Identificar el rango correspondiente a este stat
    const [minVal, maxVal] = carConstants.statsMinMax[statID] || [0, 100]; // fallback [0,100] si no está en el diccionario
    
    // Evitar división por cero en caso de minVal == maxVal
    const rangeSize = maxVal - minVal;
    if (rangeSize <= 0) {
      return originalValue; 
    }
  
    // 2) Normalizar (0 a 1)
    let normalized = (originalValue - minVal) / rangeSize;
  
    // 3) Multiplicar por el boost
    normalized *= boost;
  
    // 4) Clamp a [0,1]
    if (normalized > 1) normalized = 1;
    if (normalized < 0) normalized = 0;
  
    // 5) Des-normalizar
    const newValue = minVal + normalized * rangeSize;
    return newValue;
  }

/**
 * Devuelve el UnitValue de cada stat de un dict de diseños
 * (En Python: get_unitvalue_from_parts)
 */
export function getUnitValueFromParts(designDict) {
    const statsValues = {};
    for (const part in designDict) {
        const designID = designDict[part][0][0];
        const rows = queryDB(`
          SELECT PartStat, UnitValue
          FROM Parts_Designs_StatValues
          WHERE DesignID = ?
        `, [designID], 'allRows');

        const tmp = {};
        for (const [stat, unitVal] of rows) {
            tmp[stat] = unitVal;
        }
        statsValues[carConstants.parts[part]] = tmp;
    }
    return statsValues;
}

/**
 * UnitValue de un solo diseño
 * (get_unitvalue_from_one_part en Python)
 */
export function getTeamExpertise(teamId, yearIteration = null) {
    const expertise = {};
    const partTypes = [3, 4, 5, 6, 7, 8];

    partTypes.forEach((partType) => {
        expertise[carConstants.parts[partType]] = {};
    });

    const rows = queryDB(`
        SELECT PartType, PartStat, Expertise
        FROM Parts_TeamExpertise
        WHERE TeamID = ?
          AND PartType IN (3, 4, 5, 6, 7, 8)
          AND PartStat != 15
    `, [teamId], 'allRows') || [];

    rows.forEach((row) => {
        const partType = Number(row[0]);
        const stat = Number(row[1]);
        const rawValue = Number(row[2]);

        const partKey = carConstants.parts[partType];
        if (!partKey) return;

        let unitValue = rawValue;
        if (yearIteration === "24" && stat >= 7 && stat <= 9 && carConstants.downforce24ValueToUnitValue?.[stat]) {
            unitValue = carConstants.downforce24ValueToUnitValue[stat](rawValue);
        }
        else if (carConstants.valueToUnitValue?.[stat]) {
            unitValue = carConstants.valueToUnitValue[stat](rawValue);
        }

        expertise[partKey][stat] = Math.round(unitValue * 1000) / 1000;
    });

    partTypes.forEach((partType) => {
        const partKey = carConstants.parts[partType];
        const partStats = expertise[partKey];
        for (const stat of carConstants.defaultPartsStats[partType] || []) {
            if (stat === 15) continue;
            if (partStats[stat] === undefined) {
                partStats[stat] = 0;
            }
        }
    });

    return expertise;
}

export function updateTeamExpertise(teamId, expertiseUnitValues, yearIteration = null) {
    if (!expertiseUnitValues || typeof expertiseUnitValues !== "object") return;

    for (const partTypeKey of Object.keys(expertiseUnitValues)) {
        const partType = Number(partTypeKey);
        const stats = expertiseUnitValues[partTypeKey];
        if (!Number.isFinite(partType) || !stats || typeof stats !== "object") continue;

        for (const statKey of Object.keys(stats)) {
            const stat = Number(statKey);
            const unitValue = Number(stats[statKey]);
            if (!Number.isFinite(stat) || !Number.isFinite(unitValue)) continue;
            if (stat === 15) continue;

            let value = unitValue;
            if (yearIteration === "24" && stat >= 7 && stat <= 9 && carConstants.downforce24UnitValueToValue?.[stat]) {
                value = carConstants.downforce24UnitValueToValue[stat](unitValue);
            }
            else if (carConstants.unitValueToValue?.[stat]) {
                value = carConstants.unitValueToValue[stat](unitValue);
            }

            queryDB(`
                UPDATE Parts_TeamExpertise
                SET Expertise = ?
                WHERE TeamID = ?
                  AND PartType = ?
                  AND PartStat = ?
            `, [value, teamId, partType, stat], 'run');
        }
    }
}

export function getUnitValueFromOnePart(designId) {

    const partType = queryDB(`
            SELECT PartType
            FROM Parts_Designs
            WHERE DesignID = ?
        `, [designId], 'singleValue');


    const rows = queryDB(`
            SELECT PartStat, UnitValue
            FROM Parts_Designs_StatValues
            WHERE DesignID = ?
        `, [designId], 'allRows');


    const statsValues = {};
    for (const [stat, uv] of rows) {
        statsValues[stat] = uv;
    }
    const partValues = {};
    partValues[carConstants.parts[partType]] = statsValues;
    return partValues;
}

/**
 * Simple helper: convierte un porcentaje a valor físico según min/max
 * (convert_percentage_to_value en Python)
 */
export function convertPercentageToValue(attribute, percentage, minMax) {
    // minMax[attribute] = [min_value, max_value]
    const [minValue, maxValue] = minMax[attribute];
    return minValue + (maxValue - minValue) * (percentage / 100.0);
}

function clampPerformancePercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric));
}

function getUnitValueRange(stat) {
    const range = carConstants.statsMinMax?.[stat];
    if (Array.isArray(range) && range.length >= 2) {
        return [Number(range[0]), Number(range[1])];
    }
    return [0, 100];
}

function getUnitValueForPerformance(stat, percent) {
    const [minValue, maxValue] = getUnitValueRange(stat);
    return minValue + (maxValue - minValue) * (percent / 100);
}

function getPerformancePercentFromUnitValue(stat, unitValue) {
    const [minValue, maxValue] = getUnitValueRange(stat);
    const range = maxValue - minValue;
    if (range <= 0) return 0;

    return clampPerformancePercent(((Number(unitValue) - minValue) / range) * 100);
}

function getValueFromUnitValue(stat, unitValue, yearIteration = null) {
    const statNumber = Number(stat);
    if (yearIteration === "24" && statNumber >= 7 && statNumber <= 9 && carConstants.downforce24UnitValueToValue?.[statNumber]) {
        return carConstants.downforce24UnitValueToValue[statNumber](unitValue);
    }

    const converter = carConstants.unitValueToValue?.[statNumber];
    return typeof converter === "function" ? converter(unitValue) : unitValue;
}

function removeContributorStats(contributors, excludedStats = []) {
    const excluded = new Set(excludedStats.map((stat) => String(stat)));
    const filteredContributors = {};

    for (const attribute of Object.keys(contributors || {})) {
        const entries = Object.entries(contributors[attribute] || {})
            .filter(([stat]) => !excluded.has(String(stat)));
        const total = entries.reduce((sum, [, contribution]) => sum + Number(contribution || 0), 0);
        if (entries.length === 0 || total <= 0) continue;

        filteredContributors[attribute] = {};
        for (const [stat, contribution] of entries) {
            filteredContributors[attribute][stat] = Math.round((Number(contribution) / total) * 1000) / 1000;
        }
    }

    return filteredContributors;
}

function getAeroPerformanceWeights() {
    const contributors = removeContributorStats(getContributorsDict(), [10, 16]);
    const weights = {};

    for (const attributeIndex of Object.keys(contributors)) {
        const attributeName = carConstants.carAttributes[attributeIndex];
        const attributeWeight = Number(carConstants.attributesContributions4[attributeName]) || 0;
        if (attributeWeight <= 0) continue;

        for (const stat of Object.keys(contributors[attributeIndex])) {
            const factorDict = carConstants[`${carConstants.stats[stat]}_factors`] || {};
            for (const part of [3, 4, 5, 6, 7, 8]) {
                if (!(carConstants.defaultPartsStats?.[part] || []).includes(Number(stat))) continue;

                const factor = Number(factorDict[part]) || 0;
                if (factor <= 0) continue;

                const key = `${part}:${stat}`;
                weights[key] = (weights[key] || 0) + attributeWeight * Number(contributors[attributeIndex][stat]) * factor;
            }
        }
    }

    return weights;
}

function calculateAeroMainStatPerformance(unitStatsByPart) {
    const weights = getAeroPerformanceWeights();
    let weightedScore = 0;
    let totalWeight = 0;

    for (const key of Object.keys(weights)) {
        const [part, stat] = key.split(":");
        const unitValue = unitStatsByPart?.[part]?.[stat];
        if (unitValue === null || unitValue === undefined) continue;

        const weight = weights[key];
        weightedScore += getPerformancePercentFromUnitValue(stat, unitValue) * weight;
        totalWeight += weight;
    }

    if (totalWeight <= 0) return 0;
    return Math.round((weightedScore / totalWeight) * 100) / 100;
}

function getAeroPerformanceFromDesignDict(designDict) {
    const unitStatsByPart = {};

    for (const part of [3, 4, 5, 6, 7, 8]) {
        const designID = designDict?.[part]?.[0]?.[0];
        if (designID === null || designID === undefined) continue;

        const rows = queryDB(`
          SELECT PartStat, UnitValue
          FROM Parts_Designs_StatValues
          WHERE DesignID = ?
        `, [designID], "allRows") || [];

        unitStatsByPart[part] = {};
        for (const [stat, unitValue] of rows) {
            unitStatsByPart[part][stat] = unitValue;
        }
    }

    return calculateAeroMainStatPerformance(unitStatsByPart);
}

function solveUniformPartPerformance(teamParts, targetOverall, yearIteration = null) {
    const uniformPercent = Math.round(clampPerformancePercent(targetOverall) * 1000) / 1000;
    return {
        uniformPercent,
        projectedOverall: uniformPercent
    };
}

function getDesignIDsForTeamPart(teamParts, fittedParts, part) {
    const designIDs = new Set();
    const bestDesign = teamParts?.[part]?.[0]?.[0];
    if (bestDesign !== null && bestDesign !== undefined) {
        designIDs.add(Number(bestDesign));
    }

    for (const loadout of [1, 2]) {
        const fittedDesign = fittedParts?.[loadout]?.[part]?.[0]?.[0];
        if (fittedDesign !== null && fittedDesign !== undefined) {
            designIDs.add(Number(fittedDesign));
        }
    }

    return Array.from(designIDs).filter((designID) => Number.isFinite(designID));
}

function upsertDesignStatValue(designID, stat, value, unitValue) {
    const exists = queryDB(`
        SELECT 1
        FROM Parts_Designs_StatValues
        WHERE DesignID = ?
          AND PartStat = ?
    `, [designID, stat], 'singleValue');

    if (exists) {
        queryDB(`
            UPDATE Parts_Designs_StatValues
            SET UnitValue = ?, Value = ?
            WHERE DesignID = ?
              AND PartStat = ?
        `, [unitValue, value, designID, stat], 'run');
    }
    else {
        queryDB(`
            INSERT INTO Parts_Designs_StatValues
            VALUES (?, ?, ?, ?, 0.5, 1, 0.1)
        `, [designID, stat, value, unitValue], 'run');
    }
}

export function setOverallPerformanceTeam(teamId, targetOverall, customTeam = null, yearIteration = null) {
    const row = queryDB(`
      SELECT Day
      FROM Player_State
    `, [], 'singleRow');

    if (!row) {
        throw new Error("Player_State not found");
    }

    const [day] = row;
    const bestParts = getBestPartsUntil(day, customTeam);
    const teamParts = bestParts[Number(teamId)];
    if (!teamParts) {
        throw new Error(`Team ${teamId} parts not found`);
    }

    const solved = solveUniformPartPerformance(teamParts, targetOverall, yearIteration);
    const fittedParts = getFittedDesigns(customTeam)?.[Number(teamId)] || {};
    let updatedDesignCount = 0;

    for (const part of [3, 4, 5, 6, 7, 8]) {
        const designIDs = getDesignIDsForTeamPart(teamParts, fittedParts, part);
        if (designIDs.size === 0) continue;

        const defaultStats = carConstants.defaultPartsStats?.[part] || [];
        for (const stat of defaultStats) {
            if (Number(stat) === 15) continue;

            const unitValue = getUnitValueForPerformance(stat, solved.uniformPercent);
            const value = getValueFromUnitValue(stat, unitValue, yearIteration);
            changeExpertiseBased(part, stat, value, Number(teamId));

            designIDs.forEach((designID) => {
                upsertDesignStatValue(designID, stat, value, unitValue);
            });
        }

        updatedDesignCount += designIDs.size;
    }

    return { ...solved, updatedDesignCount };
}

/**
 * Pasa todos los atributos a rango human-readable
 * (make_attributes_readable en Python)
 */
export function makeAttributesReadable(attributes) {
    for (const attribute in attributes) {
        attributes[attribute] = convertPercentageToValue(
            attribute,
            attributes[attribute],
            carConstants.attributesMinMax
        );
        // redondea a 3 dec
        attributes[attribute] = Math.round(attributes[attribute] * 1000) / 1000;
        attributes[attribute] = `${attributes[attribute]} ${carConstants.attributesUnits[attribute]}`;
    }
    return attributes;
}

/**
 * Calcula la performance global sumando (valorStat * contribución)
 * (calculate_overall_performance en Python)
 */
export function calculateOverallPerformance(attributes) {
    let ovr = 0;
    for (const attr in attributes) {
        ovr += attributes[attr] * carConstants.attributesContributions4[attr];
    }
    return Math.round(ovr * 100) / 100;
}

/**
 * Devuelve un diccionario con las contribuciones
 * (get_contributors_dict en Python)
 */
export function getContributorsDict() {
    // Lógica similar a Python
    const contributorsValues = {};
    const totalValues = {};

    for (const attribute in carConstants.carAttributes) {
        totalValues[attribute] = 0;
        const referenceDict = carConstants[`${carConstants.carAttributes[attribute]}_contributors`];
        // O donde sea que esté definido
        for (const stat in referenceDict) {
            totalValues[attribute] += referenceDict[stat];
        }
    }

    for (const attribute in carConstants.carAttributes) {
        const referenceDict = carConstants[`${carConstants.carAttributes[attribute]}_contributors`];
        contributorsValues[attribute] = {};
        for (const stat in referenceDict) {
            contributorsValues[attribute][stat] =
                Math.round((referenceDict[stat] / totalValues[attribute]) * 1000) / 1000;
        }
    }

    return contributorsValues;
}

/**
 * Suma los factores de cada stat de cada parte
 * (get_part_stats_dict en Python)
 */
export function getPartStatsDict(carDict) {
    const partStats = {};
    for (const part in carDict) {
        for (const stat in carDict[part]) {
            const factor = carConstants[`${carConstants.stats[stat]}_factors`][part];
            if (!partStats[stat]) {
                partStats[stat] = 0;
            }
            partStats[stat] += carDict[part][stat] * factor;
        }
    }
    return partStats;
}

/**
 * Calcula los atributos finales sumando (contribución * partStats[stat]) / 10
 * (calculate_car_attributes en Python)
 */
export function calculateCarAttributes(contributors, partsStats) {
    const attributesDict = {};
    // Ajuste: partsStats[16] = (20000 - partsStats[15]) / 20  (como en el .py)
    partsStats[16] = (20000 - partsStats[15]) / 20;

    for (const attribute in contributors) {
        attributesDict[carConstants.carAttributes[attribute]] = 0;
        for (const stat in contributors[attribute]) {
            attributesDict[carConstants.carAttributes[attribute]] +=
                (contributors[attribute][stat] * partsStats[stat]) / 10;
        }
    }
    return attributesDict;
}

/**
 * Obtiene días de carreras
 * (get_races_days en Python)
 */
export function getRacesDays() {
    const [day, season] = queryDB(`
        SELECT Day, CurrentSeason 
        FROM Player_State
      `, [], 'singleRow') || [0, 0];

    // state=2 => completadas, state=0 => no comenzadas
    const races = queryDB(`
        SELECT RaceID, Day, TrackID
        FROM Races
        WHERE SeasonID = ?
          AND State = 2
      `, [season], 'allRows');

    // first_race_state_0 => la primera no iniciada
    const firstRaceState0 = queryDB(`
        SELECT RaceID, Day, TrackID
        FROM Races
        WHERE SeasonID = ?
          AND State = 0
        ORDER BY Day ASC
        LIMIT 1
      `, [season], 'singleRow');

    if (firstRaceState0) {
        races.push(firstRaceState0);
    }
    return races;
}

export function getAllRaces() {
    const [day, season] = queryDB(`
        SELECT Day, CurrentSeason
        FROM Player_State
      `, [], 'singleRow') || [0, 0];

    const rows = queryDB(`
        SELECT RaceID, Day, TrackID
        FROM Races
        WHERE SeasonID = ?
      `, [season], 'allRows');
    return rows;
}

function buildEnginePowerProgressionContext() {
    const seasonId = Number(queryDB(`SELECT CurrentSeason FROM Player_State`, [], 'singleValue')) || null;
    if (!seasonId) {
        return { enabled: false };
    }

    const progressionTableExists = queryDB(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name='Custom_Engine_Progression'`,
        [],
        'singleValue'
    );
    if (!progressionTableExists) {
        return { enabled: false };
    }

    const allocations = queryDB(`SELECT teamId, engineId FROM Custom_Engine_Allocations`, [], 'allRows') || [];
    const teamEngineIdByTeamId = {};
    for (const row of allocations) {
        const teamId = Number(row?.[0]);
        const engineId = Number(row?.[1]);
        if (!teamId || !engineId) continue;
        teamEngineIdByTeamId[teamId] = engineId;
    }

    const currentPowerRows = queryDB(`
        SELECT engineId, unitValue
        FROM Custom_Engines_Stats
        WHERE designId = engineId
          AND partStat = 10
    `, [], 'allRows') || [];

    const currentPowerByEngineId = {};
    for (const row of currentPowerRows) {
        const engineId = Number(row?.[0]);
        const unitValue = Number(row?.[1]);
        if (!engineId || !Number.isFinite(unitValue)) continue;
        currentPowerByEngineId[engineId] = unitValue;
    }

    return {
        enabled: true,
        seasonId,
        teamEngineIdByTeamId,
        currentPowerByEngineId
    };
}

function getEnginePowerUnitValueForRace(engineId, raceId, ctx) {
    const current = ctx?.currentPowerByEngineId?.[engineId];
    if (!Number.isFinite(current)) {
        return null;
    }

    const snapshot = queryDB(`
        SELECT Power
        FROM Custom_Engine_Progression
        WHERE SeasonID = ?
          AND EngineID = ?
          AND RaceID > ?
        ORDER BY RaceID ASC
        LIMIT 1
    `, [ctx.seasonId, engineId, raceId], 'singleValue');

    if (snapshot !== null && snapshot !== undefined) {
        const snapNum = Number(snapshot);
        if (Number.isFinite(snapNum)) {
            return snapNum;
        }
    }

    return current;
}

/**
 * Devuelve la performance de todos los equipos en un día dado (o actual)
 * (get_performance_all_teams en Python)
 */
export function getPerformanceAllTeams(day = null, previous = null, customTeam = false, options = null) {
    const teams = {};

    const teamList = customTeam
        ? [...Array(10).keys()].map(i => i + 1).concat(32)
        : [...Array(10).keys()].map(i => i + 1);

    let parts;
    if (day == null) {
        // Usamos getBestParts
        parts = getBestParts(customTeam);
    } else {
        parts = getBestPartsUntil(day, customTeam);
    }

    for (const teamId of teamList) {
        teams[teamId] = getAeroPerformanceFromDesignDict(parts[teamId]);
    }
    return teams;
}

/**
 * Devuelve la performance de todos los coches (car1 y car2) de cada equipo
 * (get_performance_all_cars en Python)
 */
export function getPerformanceAllCars(customTeam = false) {
    const cars = {};

    // Este método en Python usaba "get_fitted_designs(custom_team=custom_team)"
    const carsParts = getFittedDesigns(customTeam);

    for (const teamId of Object.keys(carsParts)) {
        cars[teamId] = {};
        for (const carId of Object.keys(carsParts[teamId])) {
            // Falta ver si hay partes sin design
            const missingParts = [];
            for (const part in carsParts[teamId][carId]) {
                if (carsParts[teamId][carId][part][0][0] == null) {
                    missingParts.push(part);
                }
            }

            const ovr = getAeroPerformanceFromDesignDict(carsParts[teamId][carId]);

            const driverNumber = getDriverNumberWithCar(teamId, carId);
            cars[teamId][carId] = [ovr, driverNumber, missingParts];
        }
    }

    return cars;
}

/**
 * Devuelve los atributos de todos los coches
 * (get_attributes_all_cars en Python)
 */
export function getAttributesAllCars(customTeam = false) {
    const cars = {};
    const contributors = getContributorsDict();

    const teamList = customTeam
        ? [...Array(10).keys()].map(i => i + 1).concat(32)
        : [...Array(10).keys()].map(i => i + 1);

    const carsParts = getFittedDesigns(customTeam);

    for (const teamId of Object.keys(carsParts)) {
        cars[teamId] = {};
        for (const carId of Object.keys(carsParts[teamId])) {
            const dict = getCarStats(carsParts[teamId][carId]);
            const partStats = getPartStatsDict(dict);
            const attributes = calculateCarAttributes(contributors, partStats);
            // (En Python, se dejaba la opción de "make_attributes_readable")
            // attributes = makeAttributesReadable(attributes);
            cars[teamId][carId] = attributes;
        }
    }
    return cars;
}

/**
 * Devuelve el número del driver que conduce un coche concreto
 * (get_driver_number_with_car en Python)
 */
export function getDriverNumberWithCar(teamId, carId) {
    const row = queryDB(`
        SELECT con.StaffID
        FROM Staff_Contracts con
        JOIN Staff_GameData gam ON con.StaffID = gam.StaffID
        WHERE con.TeamID = ?
          AND gam.StaffType = 0
          AND con.ContractType = 0
          AND con.PosInTeam = ?
      `, [teamId, carId], 'singleRow');
    if (!row) {
        return null;
    }
    const driverId = row[0];

    const number = queryDB(`
        SELECT Number
        FROM Staff_DriverNumbers
        WHERE CurrentHolder = ?
      `, [driverId], 'singleValue');
    return number ?? null;
}

/**
 * Obtiene los diseños equipados en cada coche (loadout 1 y 2) de cada equipo
 * (get_fitted_designs en Python)
 */
export function getFittedDesigns(customTeam = false) {
    const teams = {};
    const teamList = customTeam
        ? [...Array(10).keys()].map(i => i + 1).concat(32)
        : [...Array(10).keys()].map(i => i + 1);

    for (const t of teamList) {
        teams[t] = {};
        // loadout => 1 o 2
        for (let loadout = 1; loadout <= 2; loadout++) {
            const designs = {};
            for (let part = 3; part < 9; part++) {
                const row = queryDB(`
                    SELECT DesignID
                    FROM Parts_CarLoadout
                    WHERE TeamID = ?
                        AND PartType = ?
                        AND LoadoutID = ?
                    `, [t, part, loadout], 'allRows');
                designs[part] = row;
            }
            // engine
            const engine = queryDB(`
                    SELECT MAX(DesignID)
                    FROM Parts_Designs
                    WHERE PartType = 0
                    AND TeamID = ?
                `, [t], 'allRows');
            designs[0] = engine;

            teams[t][loadout] = designs;
        }
    }
    return teams;
}

// Asumiendo que tu clase CarAnalysisUtils ya tiene otros métodos traducidos
// Añadimos/completamos con estos métodos:

export function fitLatestDesignsAllGrid(customTeam = false) {
    // SELECT Day, CurrentSeason FROM Player_State
    const row = queryDB(`
        SELECT Day, CurrentSeason 
        FROM Player_State
        `, [], "singleRow");

    if (!row) {
        console.warn("No Player_State data found.");
        return;
    }

    const [day, season] = row;
    // Obtenemos las mejores piezas hasta 'day'
    const bestParts = getBestPartsUntil(day, customTeam);

    // Para cada equipo en bestParts
    for (const team of Object.keys(bestParts)) {
        fitLatestDesignsOneTeam(team, bestParts[team]);
    }

    // conn.commit() (en SQL.js no es necesario típicamente)
}

function getTeamList(customTeam = false) {
    return customTeam
        ? [...Array(10).keys()].map(i => i + 1).concat(32)
        : [...Array(10).keys()].map(i => i + 1);
}

function toFiniteNumberOrNull(value) {
    if (value === null || value === undefined) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function getBuiltPartCount(designId, partType) {
    return Number(queryDB(`
        SELECT COUNT(*)
        FROM Parts_Items
        WHERE DesignID = ?
          AND BuildWork = ?
    `, [designId, carConstants.standardBuildworkPerPart[partType]], "singleValue")) || 0;
}

function getRemovablePartItems(designId, partType) {
    return queryDB(`
        SELECT pi.ItemID
        FROM Parts_Items pi
        WHERE pi.DesignID = ?
          AND pi.BuildWork = ?
          AND pi.AssociatedCar IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM Parts_CarLoadout pcl
              WHERE pcl.ItemID = pi.ItemID
          )
        ORDER BY pi.ItemID DESC
    `, [designId, carConstants.standardBuildworkPerPart[partType]], "allRows") || [];
}

function deleteBuiltPartItem(itemId) {
    queryDB(`
        DELETE FROM Parts_Items
        WHERE ItemID = ?
    `, [itemId], "run");
}

function getFittedDesignUsage(customTeam = false) {
    const usage = new Map();

    for (const teamId of getTeamList(customTeam)) {
        for (let partType = 3; partType < 9; partType++) {
            const rows = queryDB(`
                SELECT LoadoutID, DesignID, ItemID
                FROM Parts_CarLoadout
                WHERE TeamID = ?
                  AND PartType = ?
                  AND LoadoutID IN (1, 2)
                  AND DesignID IS NOT NULL
            `, [teamId, partType], "allRows") || [];

            for (const row of rows) {
                const loadoutId = toFiniteNumberOrNull(row[0]);
                const designId = toFiniteNumberOrNull(row[1]);
                const itemId = toFiniteNumberOrNull(row[2]);
                if (designId === null) continue;

                if (!usage.has(designId)) {
                    usage.set(designId, {
                        designId,
                        partType,
                        teams: new Set(),
                        fittedCount: 0,
                        fittedItemIds: new Set()
                    });
                }

                const info = usage.get(designId);
                info.teams.add(Number(teamId));
                info.fittedCount += 1;
                if (loadoutId !== null && itemId !== null) {
                    info.fittedItemIds.add(itemId);
                }
            }
        }
    }

    return usage;
}

function setBuiltPartCount(designId, partType, requestedCount, minimumCount = 0) {
    const requested = Math.max(0, Math.floor(Number(requestedCount)));
    const minimum = Math.max(0, Math.floor(Number(minimumCount) || 0));
    const targetCount = Math.max(requested, minimum);
    const beforeCount = getBuiltPartCount(designId, partType);
    let created = 0;
    let deleted = 0;

    if (beforeCount < targetCount) {
        for (let i = beforeCount; i < targetCount; i++) {
            createNewItem(designId, partType);
            created += 1;
        }
    }
    else if (beforeCount > targetCount) {
        const removableItems = getRemovablePartItems(designId, partType);
        let currentCount = beforeCount;

        for (const row of removableItems) {
            if (currentCount <= targetCount) break;
            deleteBuiltPartItem(row[0]);
            currentCount -= 1;
            deleted += 1;
        }
    }

    return {
        designId,
        partType,
        requestedCount: requested,
        targetCount,
        beforeCount,
        afterCount: getBuiltPartCount(designId, partType),
        created,
        deleted,
        minimumApplied: targetCount !== requested
    };
}

export function setFittedPartsCountAllTeams(requestedCount, customTeam = false) {
    const count = Number(requestedCount);
    if (!Number.isFinite(count) || count < 0) {
        throw new Error("Invalid fitted parts count");
    }

    const usage = getFittedDesignUsage(customTeam);
    const updates = [];

    for (const info of usage.values()) {
        updates.push(setBuiltPartCount(
            info.designId,
            info.partType,
            Math.floor(count),
            info.fittedCount
        ));
    }

    return {
        requestedCount: Math.floor(count),
        updatedDesigns: updates.length,
        createdItems: updates.reduce((sum, update) => sum + update.created, 0),
        deletedItems: updates.reduce((sum, update) => sum + update.deleted, 0),
        minimumAdjustedDesigns: updates.filter((update) => update.minimumApplied).length
    };
}

function releaseLoadoutItem(teamId, partType, loadoutId) {
    const row = queryDB(`
        SELECT ItemID
        FROM Parts_CarLoadout
        WHERE TeamID = ?
          AND PartType = ?
          AND LoadoutID = ?
    `, [teamId, partType, loadoutId], "singleRow");

    const itemId = toFiniteNumberOrNull(row?.[0]);
    if (itemId === null) return;

    const remainingLoadout = queryDB(`
        SELECT LoadoutID
        FROM Parts_CarLoadout
        WHERE ItemID = ?
          AND NOT (TeamID = ? AND PartType = ? AND LoadoutID = ?)
        ORDER BY LoadoutID ASC
        LIMIT 1
    `, [itemId, teamId, partType, loadoutId], "singleRow");

    const remainingLoadoutId = toFiniteNumberOrNull(remainingLoadout?.[0]);
    queryDB(`
        UPDATE Parts_Items
        SET AssociatedCar = ?, LastEquippedCar = ?
        WHERE ItemID = ?
    `, [remainingLoadoutId, remainingLoadoutId, itemId], "run");
}

function getAvailableItemForDesign(designId, partType, excludedItemIds = new Set()) {
    const rows = queryDB(`
        SELECT pi.ItemID
        FROM Parts_Items pi
        WHERE pi.DesignID = ?
          AND pi.BuildWork = ?
          AND pi.AssociatedCar IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM Parts_CarLoadout pcl
              WHERE pcl.ItemID = pi.ItemID
          )
        ORDER BY pi.ItemID ASC
    `, [designId, carConstants.standardBuildworkPerPart[partType]], "allRows") || [];

    for (const row of rows) {
        const itemId = toFiniteNumberOrNull(row?.[0]);
        if (itemId !== null && !excludedItemIds.has(itemId)) {
            return itemId;
        }
    }

    return null;
}

function isItemValidForDesign(itemId, designId, partType) {
    if (itemId === null) return false;

    const itemCount = Number(queryDB(`
        SELECT COUNT(*)
        FROM Parts_Items
        WHERE ItemID = ?
          AND DesignID = ?
          AND BuildWork = ?
    `, [itemId, designId, carConstants.standardBuildworkPerPart[partType]], "singleValue")) || 0;

    return itemCount > 0;
}

function fitDesignToLoadout(teamId, partType, loadoutId, designId) {
    const current = queryDB(`
        SELECT DesignID, ItemID
        FROM Parts_CarLoadout
        WHERE TeamID = ?
          AND PartType = ?
          AND LoadoutID = ?
    `, [teamId, partType, loadoutId], "singleRow");

    const currentDesignId = toFiniteNumberOrNull(current?.[0]);
    const currentItemId = toFiniteNumberOrNull(current?.[1]);
    let needsNewItem = currentDesignId !== Number(designId) || currentItemId === null
        || !isItemValidForDesign(currentItemId, designId, partType);

    if (!needsNewItem) {
        const itemUses = Number(queryDB(`
            SELECT COUNT(*)
            FROM Parts_CarLoadout
            WHERE ItemID = ?
        `, [currentItemId], "singleValue")) || 0;
        needsNewItem = itemUses > 1;
    }

    if (!needsNewItem) {
        queryDB(`
            UPDATE Parts_Items
            SET AssociatedCar = ?, LastEquippedCar = ?
            WHERE ItemID = ?
        `, [loadoutId, loadoutId, currentItemId], "run");
        return { changed: false, created: false };
    }

    releaseLoadoutItem(teamId, partType, loadoutId);

    let itemId = getAvailableItemForDesign(designId, partType);
    let created = false;
    if (itemId === null) {
        itemId = createNewItem(designId, partType);
        created = true;
    }

    addPartToLoadout(designId, partType, teamId, loadoutId, itemId);
    return { changed: true, created };
}

function freeUnreferencedAssociatedCarPartItems() {
    const rows = queryDB(`
        SELECT pi.ItemID
        FROM Parts_Items pi
        INNER JOIN Parts_Designs pd ON pd.DesignID = pi.DesignID
        WHERE pd.PartType BETWEEN 3 AND 8
          AND pi.AssociatedCar IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM Parts_CarLoadout pcl
              WHERE pcl.ItemID = pi.ItemID
          )
    `, [], "allRows") || [];

    for (const row of rows) {
        queryDB(`
            UPDATE Parts_Items
            SET AssociatedCar = NULL
            WHERE ItemID = ?
        `, [row[0]], "run");
    }

    return rows.length;
}

export function repairCarLoadoutItemAssociations() {
    const rows = queryDB(`
        SELECT TeamID, PartType, LoadoutID, DesignID, ItemID
        FROM Parts_CarLoadout
        WHERE PartType BETWEEN 3 AND 8
          AND LoadoutID IN (1, 2)
        ORDER BY TeamID ASC, PartType ASC, LoadoutID ASC
    `, [], "allRows") || [];

    const usedItemIds = new Set();
    let updatedLoadouts = 0;
    let fixedAssociations = 0;
    let createdItems = 0;

    for (const row of rows) {
        const teamId = toFiniteNumberOrNull(row[0]);
        const partType = toFiniteNumberOrNull(row[1]);
        const loadoutId = toFiniteNumberOrNull(row[2]);
        const designId = toFiniteNumberOrNull(row[3]);
        const itemId = toFiniteNumberOrNull(row[4]);

        if (teamId === null || partType === null || loadoutId === null || designId === null) {
            continue;
        }

        const itemIsValid = isItemValidForDesign(itemId, designId, partType);
        const itemAlreadyUsed = itemId !== null && usedItemIds.has(itemId);

        if (!itemIsValid || itemAlreadyUsed) {
            if (itemId !== null) {
                releaseLoadoutItem(teamId, partType, loadoutId);
            }

            const excludedItemIds = new Set(usedItemIds);
            if (itemId !== null) {
                excludedItemIds.add(itemId);
            }

            let replacementItemId = getAvailableItemForDesign(designId, partType, excludedItemIds);
            if (replacementItemId === null) {
                replacementItemId = createNewItem(designId, partType);
                createdItems += 1;
            }

            addPartToLoadout(designId, partType, teamId, loadoutId, replacementItemId);
            usedItemIds.add(replacementItemId);
            updatedLoadouts += 1;
            continue;
        }

        usedItemIds.add(itemId);

        const association = queryDB(`
            SELECT AssociatedCar, LastEquippedCar
            FROM Parts_Items
            WHERE ItemID = ?
        `, [itemId], "singleRow");

        if (toFiniteNumberOrNull(association?.[0]) !== loadoutId) {
            queryDB(`
                UPDATE Parts_Items
                SET AssociatedCar = ?, LastEquippedCar = ?
                WHERE ItemID = ?
            `, [loadoutId, loadoutId, itemId], "run");
            fixedAssociations += 1;
        }
    }

    const freedItems = freeUnreferencedAssociatedCarPartItems();
    const totalChanges = updatedLoadouts + fixedAssociations + freedItems;

    return {
        updatedLoadouts,
        fixedAssociations,
        createdItems,
        freedItems,
        totalChanges
    };
}

export function fitLatestPartsAllTeams(customTeam = false) {
    const row = queryDB(`
        SELECT Day
        FROM Player_State
    `, [], "singleRow");

    if (!row) {
        throw new Error("Player_State not found");
    }

    const [day] = row;
    const bestParts = getBestPartsUntil(day, customTeam);
    let updatedLoadouts = 0;
    let createdItems = 0;
    let skippedParts = 0;

    for (const teamId of getTeamList(customTeam)) {
        const teamParts = bestParts[teamId];
        if (!teamParts) continue;

        for (let partType = 3; partType < 9; partType++) {
            const designId = toFiniteNumberOrNull(teamParts?.[partType]?.[0]?.[0]);
            if (designId === null) {
                skippedParts += 1;
                continue;
            }

            for (let loadoutId = 1; loadoutId <= 2; loadoutId++) {
                const result = fitDesignToLoadout(teamId, partType, loadoutId, designId);
                if (result.changed) updatedLoadouts += 1;
                if (result.created) createdItems += 1;
            }
        }
    }

    return { updatedLoadouts, createdItems, skippedParts };
}

export function fitLatestDesignsOneTeam(teamId, parts) {
    // Recorremos loadout = 1 y 2
    for (let loadout = 1; loadout <= 2; loadout++) {
        // Para cada 'part' en el objeto parts
        for (const partKey of Object.keys(parts)) {
            const part = Number(partKey);
            if (part !== 0) {
                // En Python, parts[part] = [[designId], ...], asumiendo la estructura
                const design = toFiniteNumberOrNull(parts[part]?.[0]?.[0]); // -> designID
                if (design !== null) {
                    fitDesignToLoadout(teamId, part, loadout, design);
                }
            }
        }
    }

    // commit
    // (en SQL.js no es necesario, pero podrías hacer db.run("BEGIN/COMMIT") si fuera el caso)
}

export function updateItemsForDesignDict(designDict, teamId) {
    for (const designKey of Object.keys(designDict)) {
        const design = Number(designKey);
        const nParts = parseInt(designDict[designKey], 10);

        // SELECT PartType FROM Parts_Designs WHERE DesignID = {design}
        const partType = queryDB(`
        SELECT PartType
        FROM Parts_Designs
        WHERE DesignID = ?
      `, [design], "singleValue");

        // SELECT COUNT(*) FROM Parts_Items WHERE DesignID = {design} AND BuildWork = X
        let actualParts = queryDB(`
        SELECT COUNT(*)
        FROM Parts_Items
        WHERE DesignID = ?
          AND BuildWork = ?
      `, [design, carConstants.standardBuildworkPerPart[partType]], "singleValue");
        if (actualParts == null) actualParts = 0;

        let diff = nParts - actualParts;
        if (diff > 0) {
            while (diff > 0) {
                createNewItem(design, partType);
                diff--;
            }
        } else if (diff < 0) {
            while (diff < 0) {
                deleteItem(design);
                diff++;
            }
        }
    }

    // commit
}

export function fitLoadoutsDict(loadoutsDict, teamId) {
    for (const partKey of Object.keys(loadoutsDict)) {
        const part = Number(partKey);
        const design1 = loadoutsDict[part][0];
        const design2 = loadoutsDict[part][1];

        if (design1 != null) {
            fitDesignToLoadout(teamId, part, 1, design1);
        }

        if (design2 != null) {
            fitDesignToLoadout(teamId, part, 2, design2);
        }
    }

    // commit
}

// En Python: create_new_item(design_id, part)
export function createNewItem(designId, part) {
    // SELECT MAX(ItemID) FROM Parts_Items
    let maxItem = queryDB(`
        SELECT MAX(ItemID)
        FROM Parts_Items
        `, [], "singleValue");

    const newItem = maxItem + 1;

    const numberOfManufactures = queryDB(`
        SELECT ManufactureCount
        FROM Parts_Designs
        WHERE DesignID = ?
        `, [designId], "singleValue");

    const newNManufactures = numberOfManufactures + 1;

    queryDB(`
        INSERT INTO Parts_Items
        VALUES (
            ?,
            ?,
            ?,
            1,
            ?,
            NULL,
            NULL,
            0,
            NULL
        )
        `, [newItem, designId, carConstants.standardBuildworkPerPart[part], newNManufactures], 'run');

    queryDB(`
            UPDATE Parts_Designs
            SET ManufactureCount = ?
            WHERE DesignID = ?
            `, [newNManufactures, designId], 'run');

    return newItem;
}

export function deleteItem(designId) {
    // SELECT PartType FROM Parts_Designs WHERE DesignID = {designId}
    const partType = queryDB(`
      SELECT PartType
      FROM Parts_Designs
      WHERE DesignID = ?
    `, [designId], "singleValue");

    // Only remove spare items. Deleting fitted items leaves car loadouts pointing at missing parts.
    const item = queryDB(`
      SELECT pi.ItemID
      FROM Parts_Items pi
      WHERE pi.DesignID = ?
        AND pi.BuildWork = ?
        AND pi.AssociatedCar IS NULL
        AND NOT EXISTS (
            SELECT 1
            FROM Parts_CarLoadout pcl
            WHERE pcl.ItemID = pi.ItemID
        )
      ORDER BY pi.ItemID DESC
      LIMIT 1
    `, [designId, carConstants.standardBuildworkPerPart[partType]], "singleValue");

    if (item == null) {
        return false;
    }

    queryDB(`
      DELETE FROM Parts_Items
      WHERE ItemID = ?
    `, [item], 'run');

    return true;
}

export function addNewDesign(part, teamId, day, season, latestDesignPartFromTeam, newDesignId) {
    const maxDesignFromPart = queryDB(`
      SELECT MAX(DesignNumber)
      FROM Parts_Designs
      WHERE PartType = ?
        AND TeamID = ?
    `, [part, teamId], "singleValue");

    const newMaxDesign = maxDesignFromPart + 1;

    queryDB(`
        UPDATE Parts_Designs_TeamData
        SET NewDesignsThisSeason = ?
        WHERE TeamID = ?
            AND PartType = ?
        `, [newMaxDesign, teamId, part], 'run');

    //check if newDesignId already exists (it shouldn't, but just in case)
    const existingDesign = queryDB(`
        SELECT DesignID
        FROM Parts_Designs
        WHERE DesignID = ?
        `, [newDesignId], 'singleValue')

    if (existingDesign) {
        return;
    }

    queryDB(`
        INSERT INTO Parts_Designs
        VALUES (
            ?,
            ?,
            6720, 
            6600, 
            ?,
            ?,
            NULL,
            5,
            1,
            0,
            0,
            1500,
            ?,
            0,
            0,
            4,
            ?,
            1,
            ?,
            1
        )
        `, [newDesignId, part, day - 1, day, season, newMaxDesign, teamId], 'run');

    queryDB(`
        INSERT INTO Parts_DesignHistoryData
        VALUES (
            ?,
            0,
            0,
            0,
            0
        )
        `, [newDesignId], 'run');

    copyFromTable("building", latestDesignPartFromTeam, newDesignId);
    copyFromTable("staff", latestDesignPartFromTeam, newDesignId);
    add4Items(newDesignId, part, teamId);
}

export function copyFromTable(table, latestDesignId, newDesignId) {
    let tableName = "";
    if (table === "building") {
        tableName = "Parts_Designs_BuildingEffects";
    } else if (table === "staff") {
        tableName = "Parts_Designs_StaffEffects";
    }

    const rows = queryDB(`
        SELECT *
        FROM ${tableName}
        WHERE DesignID = ?
        `, [latestDesignId], "allRows");

    for (const row of rows) {
        // row => [DesignID, col1, col2, ...]
        queryDB(`
                INSERT INTO ${tableName}
                VALUES (?, ?, ?, 0)
            `, [newDesignId, row[1], row[2]], 'run');
    }
}

export function add4Items(newDesignId, part, teamId) {
    let maxItem = queryDB(`
        SELECT MAX(ItemID)
        FROM Parts_Items
        `, [], "singleValue");

    for (let i = 1; i <= 4; i++) {
        maxItem += 1;
        queryDB(`
        INSERT INTO Parts_Items
        VALUES (
          ?,
          ?,
          ?,
          1,
          ?,
          NULL,
          NULL,
          0,
          NULL
        )
      `, [maxItem, newDesignId, carConstants.standardBuildworkPerPart[part], i], 'run');

        // Para loadout 1 y 2
        if (i <= 2) {
            const loadoutId = i;
            addPartToLoadout(newDesignId, part, teamId, loadoutId, maxItem);
        }
    }
}

export function addPartToLoadout(designId, part, teamId, loadoutId, itemId) {
    queryDB(`
            UPDATE Parts_CarLoadout
            SET DesignID = ?, ItemID = ?
            WHERE TeamID = ?
                AND PartType = ?
                AND LoadoutID = ?
        `, [designId, itemId, teamId, part, loadoutId], 'run');

    queryDB(`
            UPDATE Parts_Items
            SET AssociatedCar = ?, LastEquippedCar = ?
            WHERE ItemID = ?
        `, [loadoutId, loadoutId, itemId], 'run');
}

export function overwritePerformanceTeam(teamId, performance, customTeam = null, yearIteration = null, loadoutDict = null) {
    const row = queryDB(`
      SELECT Day, CurrentSeason
      FROM Player_State
    `, [], 'singleRow');

    if (!row) {
        console.warn("Player_State not found");
        return;
    }
    const [day, season] = row;

    const bestParts = getBestPartsUntil(day, customTeam);
    const teamParts = bestParts[Number(teamId)];

    for (const partKey of Object.keys(teamParts)) {
        const part = Number(partKey);
        if (part !== 0) {
            const design = teamParts[part][0][0]; // design actual
            const partName = carConstants.parts[part];         // "Suspension", "Wing", etc.
            const newDesign = performance[partName]["designEditing"];
            delete performance[partName]["designEditing"];
            let latestDesignPartFromTeam = null;

            let finalDesign = design;
            if (Number(newDesign) === -1) {
                // new part
                const maxDesign = queryDB(`
                        SELECT MAX(DesignID)
                        FROM Parts_Designs
                    `, [], 'singleValue');

                latestDesignPartFromTeam = queryDB(`
                        SELECT MAX(DesignID)
                        FROM Parts_Designs
                        WHERE PartType = ?
                        AND TeamID = ?
                    `, [part, teamId], 'singleValue');

                const newDesignId = maxDesign + 1;
                addNewDesign(part, Number(teamId), day, season, latestDesignPartFromTeam, newDesignId);
                finalDesign = newDesignId;
            } else {
                finalDesign = Number(newDesign);
            }

            const statsObj = performance[partName];
            for (const statKey of Object.keys(statsObj)) {
                const statNum = parseFloat(statsObj[statKey]);
                let value;
                if (yearIteration === "24" && Number(statKey) >= 7 && Number(statKey) <= 9) {
                    value = carConstants.downforce24UnitValueToValue[statKey](statNum);
                } else {
                    value = carConstants.unitValueToValue[statKey](statNum);
                }

                if (Number(newDesign) !== -1) {
                    // update
                    changeExpertiseBased(part, statKey, value, Number(teamId));
                    queryDB(`
                    UPDATE Parts_Designs_StatValues
                    SET UnitValue = ?
                    WHERE DesignID = ?
                        AND PartStat = ?
                    `, [statsObj[statKey], finalDesign, statKey], 'run');

                    queryDB(`
                    UPDATE Parts_Designs_StatValues
                    SET Value = ?
                    WHERE DesignID = ?
                        AND PartStat = ?
                    `, [value, finalDesign, statKey], 'run');
                } else {
                    // insert
                    queryDB(`
                    INSERT INTO Parts_Designs_StatValues
                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        0.5, 
                        1, 
                        0.1
                    )
                    `, [finalDesign, statKey, value, statsObj[statKey]], 'run');
                }
            }

            // si newDesign == -1 => insertamos el peso standard
            if (Number(newDesign) === -1) {
                queryDB(`
                    INSERT INTO Parts_Designs_StatValues
                    VALUES (
                    ?,
                    15,
                    500,
                    ?,
                    0.5,
                    0,
                    0
                    )
                `, [finalDesign, carConstants.standardWeightPerPart[part]], 'run');

                // Tras insertar stats, cambiamos expertise
                for (const statKey of Object.keys(statsObj)) {
                    const statNum = parseFloat(statsObj[statKey]);
                    let value;
                    if (yearIteration === "24" && Number(statKey) >= 7 && Number(statKey) <= 9) {
                        value = carConstants.downforce24UnitValueToValue[statKey](statNum);
                    } else {
                        value = carConstants.unitValueToValue[statKey](statNum);
                    }
                    changeExpertiseBased(part, statKey, value, Number(teamId), "new", latestDesignPartFromTeam);
                }
            }
        }
    }

    // commit
}

export function changeExpertiseBased(part, stat, newValue, teamId, type = "existing", oldDesign = null) {
    // SELECT Day, CurrentSeason FROM Player_State
    const row = queryDB(`
      SELECT Day, CurrentSeason
      FROM Player_State
    `, [], 'singleRow');
    if (!row) {
        console.warn("No Player_State found to do expertise changes");
        return;
    }
    const [day, curSeason] = row;

    let currentValue = null;
    if (type === "existing") {
        // SELECT MAX(Value) FROM Parts_Designs_StatValues ...
        currentValue = queryDB(`
        SELECT MAX(Value)
        FROM Parts_Designs_StatValues
        WHERE PartStat = ?
          AND DesignID IN (
            SELECT MAX(DesignID)
            FROM Parts_Designs
            WHERE PartType = ?
              AND TeamID = ?
              AND ValidFrom = ?
          )
      `, [stat, part, teamId, curSeason], 'singleValue');
    } else if (type === "new") {
        // SELECT Value FROM Parts_Designs_StatValues ...
        currentValue = queryDB(`
        SELECT Value
        FROM Parts_Designs_StatValues
        WHERE PartStat = ?
          AND DesignID = ?
      `, [stat, oldDesign], 'singleValue');
    }

    if (!currentValue) {
        currentValue = 1; // si no hay valor
    }
    if (currentValue === 0) {
        currentValue = 1;
    }

    const currentExpertise = queryDB(`
        SELECT Expertise
        FROM Parts_TeamExpertise
        WHERE TeamID = ?
          AND PartType = ?
          AND PartStat = ?
      `, [teamId, part, stat], 'singleValue') || 0;

    // console.log(newValue, currentValue, currentExpertise);

    const newExpertise = (Number(newValue) * Number(currentExpertise)) / Number(currentValue);


    // console.log(`Old expertise: ${currentExpertise}, New expertise: ${newExpertise}`);
    queryDB(`
        UPDATE Parts_TeamExpertise
        SET Expertise = ?
        WHERE TeamID = ?
            AND PartType = ?
            AND PartStat = ?
        `, [newExpertise, teamId, part, stat], 'run');
}


export function getPerformanceAllTeamsSeason(customTeam = false, options = {}) {
    const races = getRacesDays();
    const firstDay = getFirstDaySeason();
    // Insertamos al principio (0, firstDay, 0)
    races.unshift([0, firstDay, 0]); // similar a insert(0, first_tuple)

    const racesPerformances = [];
    let previous = null;
    for (const raceDay of races) {
        // raceDay => [RaceID, Day, TrackID], en python pilla el day en [1]
        const day = raceDay[1];
        const performances = getPerformanceAllTeams(day, previous, customTeam);
        racesPerformances.push(performances);
        previous = performances;
    }

    const allRaces = getAllRaces();
    return [racesPerformances, allRaces];
}

export function getEngineEditRaceIds(seasonId = null) {
    const resolvedSeasonId = Number(seasonId) || Number(queryDB(`SELECT CurrentSeason FROM Player_State`, [], 'singleValue')) || null;
    if (!resolvedSeasonId) return [];

    const progressionTableExists = queryDB(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name='Custom_Engine_Progression'`,
        [],
        'singleValue'
    );
    if (!progressionTableExists) return [];

    const rows = queryDB(`
        SELECT DISTINCT RaceID
        FROM Custom_Engine_Progression
        WHERE SeasonID = ?
          AND Source = 'pre_engine_edit'
        ORDER BY RaceID ASC
    `, [resolvedSeasonId], 'allRows') || [];

    return rows
        .map(r => Number(r?.[0]))
        .filter(raceId => Number.isFinite(raceId) && raceId > 0);
}

export function getFirstDaySeason() {
    const query = `
        SELECT Number, COUNT(*) as Occurrences
        FROM (
            SELECT DayCreated as Number FROM Parts_Designs
            UNION ALL
            SELECT DayCompleted as Number FROM Parts_Designs
        ) Combined
        GROUP BY Number
        ORDER BY Occurrences DESC
        LIMIT 1;
        `;
    const row = queryDB(query, [], 'singleRow');
    if (!row) {
        console.warn("No firstDay found");
        return 0;
    }
    const firstDay = row[0];
    return firstDay;
}

export function getAttributesAllTeams(customTeam = false) {
    const teams = {};
    const contributors = getContributorsDict();
    const bestParts = getBestParts(customTeam);

    const teamList = customTeam
        ? [...Array(10).keys()].map(i => i + 1).concat(32)
        : [...Array(10).keys()].map(i => i + 1);

    for (const i of teamList) {
        const dict = getCarStats(bestParts[i]);
        const partStats = getPartStatsDict(dict);
        const attributes = calculateCarAttributes(contributors, partStats);
        attributes.engine_power = getOneStatUnitValueFromTeam(0, 10, i) || 0;
        teams[i] = attributes;
    }
    return teams;
}

export function getOneStatUnitValueFromTeam(part, stat, teamId) {
    const designId = queryDB(`
        SELECT MAX(DesignID)
        FROM Parts_Designs
        WHERE PartType = ?
          AND TeamID = ?
      `, [part, teamId], 'singleValue');

    if (designId){
        const unitValue = queryDB(`
            SELECT UnitValue
            FROM Parts_Designs_StatValues
            WHERE DesignID = ?
              AND PartStat = ?
        `, [designId, stat], 'singleValue');
        return unitValue;
    }
}

export function getMaxDesign() {
    const val = queryDB(`
        SELECT MAX(DesignID)
        FROM Parts_Designs
        `, [], 'singleValue');
    return val;
}

export function deleteCustomEngineAndReassign(engineIdRaw, fallbackEngineIdRaw) {
    const engineId = Number(engineIdRaw);
    if (!engineId || engineId <= 10) {
        return { ok: false, error: "Invalid custom engine id" };
    }

    let fallbackEngineId = Number(fallbackEngineIdRaw);
    if (!fallbackEngineId || fallbackEngineId === engineId) {
        fallbackEngineId = Number(queryDB(
            `SELECT engineID FROM Custom_Engines_List WHERE engineID <= 10 ORDER BY engineID ASC LIMIT 1`,
            [],
            "singleValue"
        ));
    }
    if (!fallbackEngineId || fallbackEngineId === engineId) {
        fallbackEngineId = Number(queryDB(
            `SELECT engineID FROM Custom_Engines_List WHERE engineID != ? ORDER BY engineID ASC LIMIT 1`,
            [engineId],
            "singleValue"
        ));
    }

    if (!fallbackEngineId || fallbackEngineId === engineId) {
        return { ok: false, error: "No fallback engine available" };
    }

    const teamsSupplied = queryDB(
        `SELECT teamId FROM Custom_Engine_Allocations WHERE engineId = ?`,
        [engineId],
        "allRows"
    ) || [];

    teamsSupplied.forEach(team => {
        const teamId = Number(team?.[0]);
        if (!teamId) return;
        manage_engine_change(teamId, fallbackEngineId);
    });

    queryDB(`DELETE FROM Custom_Engine_Allocations WHERE engineId = ?`, [engineId], "run");
    queryDB(`DELETE FROM Custom_Engines_Stats WHERE engineId = ?`, [engineId], "run");
    queryDB(`DELETE FROM Custom_Engines_List WHERE engineId = ?`, [engineId], "run");

    return { ok: true, fallbackEngineId, reassignedTeams: teamsSupplied.length };
}
