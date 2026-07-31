/*
 * Rainbow Pitch — Eguchi Chord Identification Method data.
 *
 * In the Eguchi method a young child learns to recognise chords by ear, and
 * always answers with a COLOR (never a note or chord name). The colour↔chord
 * mapping below is fixed and follows the order in which chords are traditionally
 * introduced. Notes are the guardian-facing musical stimulus; the child only
 * ever sees and taps the colour.
 *
 * Mapping and introduction order taken from Eguchi's Chord Identification
 * Method (see README). Notes are given as scientific pitch names for Tone.js.
 *
 * `shape` is a fixed silhouette per colour (see Sprites.shape in
 * sprites.js) — about 1 in 12 boys has some form of colour blindness, and
 * this palette has several colours (red/orange/brown/green) that can be
 * hard to tell apart by hue alone, so shape is a second, colour-independent
 * way to recognise each answer. It also just gives every colour a bit more
 * personality for a toddler.
 */

const CHORDS = [
  // --- Core chords (introduced first, one every ~2 weeks) ---
  { name: 'red',    label: 'Red',    swatch: '#e6304b', text: '#ffffff', chord: 'C',    notes: ['C4', 'E4', 'G4'], shape: 'apple' },
  { name: 'yellow', label: 'Yellow', swatch: '#ffd21e', text: '#3a2f00', chord: 'F/C',  notes: ['C4', 'F4', 'A4'], shape: 'star' },
  { name: 'blue',   label: 'Blue',   swatch: '#2f6bff', text: '#ffffff', chord: 'G/B',  notes: ['B3', 'D4', 'G4'], shape: 'raindrop' },
  { name: 'black',  label: 'Black',  swatch: '#2b2b33', text: '#ffffff', chord: 'F/A',  notes: ['A3', 'C4', 'F4'], shape: 'note' },
  { name: 'green',  label: 'Green',  swatch: '#22b04a', text: '#123018', chord: 'G/D',  notes: ['D4', 'G4', 'B4'], shape: 'leaf' },
  { name: 'orange', label: 'Orange', swatch: '#f5811f', text: '#3a1d00', chord: 'C/E',  notes: ['E4', 'G4', 'C5'], shape: 'carrot' },
  { name: 'purple', label: 'Purple', swatch: '#8a2be2', text: '#ffffff', chord: 'F',    notes: ['F4', 'A4', 'C5'], shape: 'butterfly' },
  { name: 'pink',   label: 'Pink',   swatch: '#ff4fd8', text: '#3a0033', chord: 'G',    notes: ['G4', 'B4', 'D5'], shape: 'heart' },
  { name: 'brown',  label: 'Brown',  swatch: '#9a6324', text: '#ffffff', chord: 'C/G',  notes: ['G4', 'C5', 'E5'], shape: 'acorn' },

  // --- Advanced chords (major triads on the remaining roots) ---
  { name: 'gray',       label: 'Gray',        swatch: '#8a94a6', text: '#111318', chord: 'A',  notes: ['A3', 'C#4', 'E4'],  shape: 'cloud' },
  { name: 'tan',        label: 'Tan',         swatch: '#d9b382', text: '#3a2a10', chord: 'D',  notes: ['D4', 'F#4', 'A4'],  shape: 'cookie' },
  { name: 'lightgreen', label: 'Light Green', swatch: '#8ee06a', text: '#0f3b12', chord: 'E',  notes: ['E4', 'G#4', 'B4'],  shape: 'clover' },
  { name: 'lightpurple',label: 'Light Purple',swatch: '#c8a2ff', text: '#2a1650', chord: 'Bb', notes: ['Bb3', 'D4', 'F4'],  shape: 'flower' },
  { name: 'skyblue',    label: 'Sky Blue',    swatch: '#6fd0ff', text: '#053347', chord: 'Eb', notes: ['Eb4', 'G4', 'Bb4'], shape: 'bird' },
];

// Fast lookup by colour name.
const CHORD_BY_NAME = Object.fromEntries(CHORDS.map((c) => [c.name, c]));
