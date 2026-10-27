const EXERCISES = [
  {
    id: 'A', title: 'Apartamentos Límite', timeLimitMs: 1000, memoryLimitMb: 512,
    tests: [{ input: '4 3 5\n60 45 80 60\n30 60 75\n', output: '2\n' }],
  },
  {
    id: 'B', title: 'Combinaciones de Monedas II', timeLimitMs: 1000, memoryLimitMb: 512,
    tests: [{ input: '3 9\n2 3 5\n', output: '3\n' }],
  },
  {
    id: 'C', title: 'Asignación de Habitaciones', timeLimitMs: 1000, memoryLimitMb: 512,
    checker: 'rooms',
    tests: [{ input: '3\n1 2\n2 4\n4 4\n' }],
  },
  {
    id: 'D', title: 'Algoritmo Extraño', timeLimitMs: 1000, memoryLimitMb: 512,
    tests: [{ input: '3\n', output: '3 10 5 16 8 4 2 1\n' }],
  },
  {
    id: 'E', title: 'Viajes en Ascensor', timeLimitMs: 1000, memoryLimitMb: 512,
    tests: [{ input: '4 10\n4 8 6 1\n', output: '2\n' }],
  },
  {
    id: 'F', title: 'Hangar del SBC', timeLimitMs: 1000, memoryLimitMb: 512,
    tests: [{ input: '3 2\n10 1 3\n4 13\n', output: '3\n' }],
  },
  {
    id: 'G', title: 'Juntando Datos', timeLimitMs: 1000, memoryLimitMb: 512,
    tests: [{ input: '8\n1 2 5 5 5 5 8 9\n', output: '10\n' }],
  },
  {
    id: 'H', title: 'Números de Fibonacci', timeLimitMs: 1000, memoryLimitMb: 512,
    tests: [{ input: '100\n', output: '687995182\n' }],
  },
  {
    id: 'I', title: 'Rompiendo Rosarigasino', timeLimitMs: 1000, memoryLimitMb: 1024,
    tests: [{ input: 'AGASAJOGASO\n', output: '+\n' }],
  },
  {
    id: 'J', title: 'Número de cadenas', timeLimitMs: 1000, memoryLimitMb: 1024,
    tests: [{ input: '5 2 3\n', output: '54\n' }],
  },
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
