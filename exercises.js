const { generate } = require('./testGenerators');
const TEST_DATA = require('./exerciseTests');

// Los casos viven en exerciseTests.js (archivo generado). Las entradas muy grandes (A y C) no se guardan:
// se arman al vuelo con un generador deterministico cuando el juez lee `test.input`.
function buildTests(id) {
  return TEST_DATA[id].map((entry) => {
    const test = { name: entry.name };
    if (entry.output !== undefined) test.output = entry.output;
    if (entry.gen) {
      Object.defineProperty(test, 'input', { enumerable: true, get: () => generate(entry.gen, entry.params) });
    } else {
      test.input = entry.input;
    }
    return test;
  });
}

const EXERCISES = [
  { id: 'A', title: 'Apartamentos Límite', timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('A') },
  { id: 'B', title: 'Combinaciones de Monedas II', timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('B') },
  { id: 'C', title: 'Asignación de Habitaciones', timeLimitMs: 1000, memoryLimitMb: 512, checker: 'rooms', tests: buildTests('C') },
  { id: 'D', title: 'Algoritmo Extraño', timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('D') },
  { id: 'E', title: 'Viajes en Ascensor', timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('E') },
  { id: 'F', title: 'Hangar del SBC', timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('F') },
  { id: 'G', title: 'Juntando Datos', timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('G') },
  { id: 'H', title: 'Números de Fibonacci', timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('H') },
  { id: 'I', title: 'Rompiendo Rosarigasino', timeLimitMs: 1000, memoryLimitMb: 1024, tests: buildTests('I') },
  { id: 'J', title: 'Número de cadenas', timeLimitMs: 1000, memoryLimitMb: 1024, tests: buildTests('J') },
  // Ejercicio demostrativo para ensenar a enviar soluciones al comenzar la competencia (no puntua en el ranking).
  { id: 'T', title: 'Test', demo: true, timeLimitMs: 1000, memoryLimitMb: 512, tests: buildTests('T') },
];

function normalizeOutput(value) {
  return String(value).trim().split(/\s+/).filter(Boolean);
}

function validateRoomAssignment(input, output) {
  const inputTokens = normalizeOutput(input).map(Number);
  const outputTokens = normalizeOutput(output).map(Number);
  const count = inputTokens[0];
  if (!Number.isInteger(count) || outputTokens.length !== count + 1) return false;

  const roomsUsed = outputTokens[0];
  const assignments = outputTokens.slice(1);
  if (!Number.isInteger(roomsUsed) || roomsUsed < 1 || assignments.some((room) => !Number.isInteger(room) || room < 1 || room > roomsUsed)) return false;

  const clients = [];
  for (let i = 0; i < count; i += 1) {
    clients.push({ arrival: inputTokens[1 + i * 2], departure: inputTokens[2 + i * 2], room: assignments[i] });
  }
  const byRoom = new Map();
  for (const client of clients) {
    const list = byRoom.get(client.room) || [];
    list.push(client);
    byRoom.set(client.room, list);
  }
  for (const list of byRoom.values()) {
    list.sort((a, b) => a.arrival - b.arrival);
    for (let i = 1; i < list.length; i += 1) {
      if (list[i - 1].departure >= list[i].arrival) return false;
    }
  }

  const events = [];
  for (const client of clients) {
    events.push([client.arrival, 1], [client.departure, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let active = 0;
  let minimumRooms = 0;
  for (const [, delta] of events) {
    active += delta;
    minimumRooms = Math.max(minimumRooms, active);
  }
  return roomsUsed === minimumRooms;
}

function validateOutput(exercise, test, output) {
  if (exercise.checker === 'rooms') return validateRoomAssignment(test.input, output);
  return normalizeOutput(output).join(' ') === normalizeOutput(test.output).join(' ');
}

module.exports = { EXERCISES, validateOutput };