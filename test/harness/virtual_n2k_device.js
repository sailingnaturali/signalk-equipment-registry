// tests/harness/virtual_n2k_device.js
// A fake N2K device "joining the bus": emits Actisense-format frames on stdout
// for the @signalk/streams `execute -> canboatjs -> n2k-signalk` pipe. Resolves
// @canboat/canboatjs from the signalk-server repo's node_modules (set NODE_PATH
// to the signalk-server node_modules dir, e.g.
// NODE_PATH=../signalk-server/node_modules node virtual_n2k_device.js).
const { pgnToActisenseSerialFormat } = require('@canboat/canboatjs')

const SRC = 22
function emit(pgn, fields) {
  const frame = { pgn, src: SRC, dst: 255, prio: 6,
                  timestamp: new Date().toISOString(), fields }
  process.stdout.write(pgnToActisenseSerialFormat(frame) + '\r\n')
}

function tick() {
  // 60928 ISO Address Claim -> manufacturerCode (Oceanvolt = 847)
  emit(60928, { 'Unique Number': 12345, 'Manufacturer Code': 847,
                'Device Instance Lower': 0, 'Device Instance Upper': 0,
                'Device Function': 140, 'Device Class': 50,
                'System Instance': 0, 'Industry Group': 4 })
  // 126996 Product Information -> modelId + serial
  emit(126996, { 'NMEA 2000 Version': 2100, 'Product Code': 25,
                 'Model ID': 'ServoProp 25', 'Software Version Code': '1.0',
                 'Model Version': 'A', 'Model Serial Code': 'OV-25-00412',
                 'Certification Level': 0, 'Load Equivalency': 1 })
  // 127489 Engine Parameters, Dynamic -> propulsion.0.* (engine instance 0)
  // Field names verified against @canboat/canboatjs/dist/pgns:
  //   'Instance' (not 'Engine Instance')
  //   'Temperature' (not 'Engine Coolant Temperature') — coolant temp
  //   'Oil pressure' (lowercase p; not 'Engine Oil Pressure')
  emit(127489, { 'Instance': 0, 'Temperature': 320.0,
                 'Oil pressure': 250000 })
}

setInterval(tick, 1000)
tick()
