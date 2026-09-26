/*
 * Chord Garden — internationalisation (English/Spanish).
 *
 * WHY one table per language, keyed by the same dotted strings, with English
 * as the fallback: a key that's missing (or not yet translated) in Spanish
 * should still show English text, never a raw dotted key like
 * "settings.pinSaved" — that's exactly the kind of half-broken UI a small
 * static app should never ship. The brand name "Chord Garden" is
 * deliberately never translated — it appears literally in both tables.
 *
 * Loaded right after js/data.js (see index.html) so the language is already
 * resolved to the browser's own language before anything else — including
 * Store's very first default profile name — runs.
 */

const I18n = (() => {
  // Names are always shown in their own language, for the language picker.
  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
  ];
  const SUPPORTED = LANGUAGES.map((l) => l.code);

  const STRINGS = {
    en: {
      'app.title': 'Chord Garden — Perfect Pitch for Kids',
      'child.defaultName': 'Little One',

      // ---- shared across screens --------------------------------------
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.playing': 'Playing',

      // ---- colours (Eguchi colour names) --------------------------------
      'color.red': 'Red',
      'color.yellow': 'Yellow',
      'color.blue': 'Blue',
      'color.black': 'Black',
      'color.green': 'Green',
      'color.orange': 'Orange',
      'color.purple': 'Purple',
      'color.pink': 'Pink',
      'color.brown': 'Brown',
      'color.gray': 'Gray',
      'color.tan': 'Tan',
      'color.lightgreen': 'Light Green',
      'color.lightpurple': 'Light Purple',
      'color.skyblue': 'Sky Blue',

      'avatar.fox': 'Fox',
      'avatar.cat': 'Cat',
      'avatar.bear': 'Bear',
      'avatar.panda': 'Panda',
      'avatar.frog': 'Frog',
      'avatar.owl': 'Owl',
      'avatar.penguin': 'Penguin',
      'avatar.bunny': 'Bunny',
      'avatar.pig': 'Pig',
      'avatar.koala': 'Koala',
      'avatar.lion': 'Lion',

      // ---- the growing garden's plant stages (child + celebration) -----
      'flower.today': "Today's flower: {stage}",
      'flower.stage.0': 'not planted yet',
      'flower.stage.1': 'a seed',
      'flower.stage.2': 'a sprout',
      'flower.stage.3': 'growing leaves',
      'flower.stage.4': 'a bud',
      'flower.stage.5': 'in bloom',

      // ---- Home (child start) -------------------------------------------
      'home.play': 'Play',
      'home.playAgain': 'Play again',
      'home.wakingPiano': 'Waking the piano…',
      'home.brandTitle': 'Chord Garden',
      'home.brandSub': 'Listen, then pick the flag',
      'home.tapFlagHint': 'Tap a flag to hear its song',
      'home.whoIsPlaying': 'Who is playing?',
      'home.grownUpsTitle': 'Grown-ups',

      // ---- Practice (Practice Set) ---------------------------------------
      'practice.roundsPlayed': 'Rounds played',
      'practice.listenAgain': 'Listen again',
      'practice.hearAgain': 'Hear it again',
      'practice.allDone': 'All done',
      'practice.micLevel': 'Microphone input level',

      // ---- real-piano mode: mic status/round-cue/retry -------------------
      'mic.realPianoMode': 'Real piano mode',
      'mic.explainer': 'An adult plays chords on a real piano near this device. Chord Garden listens through the microphone to figure out which chord it heard, then your child taps the colour.',
      'mic.privacyNote': 'The sound is analysed right here in the browser and is never recorded, saved, or sent anywhere.',
      'mic.notNow': 'Not now',
      'mic.ready': 'Ready',
      'mic.paused': 'Paused',
      'mic.checkingInput': 'Checking input…',
      'mic.soundDetected': 'Sound detected',
      'mic.inputQuiet': 'Input quiet',
      'mic.inputUnavailable': 'Input unavailable',
      'mic.gotIt': 'Got it!',
      'mic.playAnyColour': 'Play any colour on the piano!',
      'mic.getReady': 'Get ready…',
      'mic.listening': 'Chord Garden is listening.',
      'mic.waitingQuiet': 'Waiting for a quiet moment.',
      'mic.tryAgain': 'Try again',
      'mic.skipThisOne': 'Skip this one',
      'mic.howDetectionWorks': 'How real piano detection works',
      'mic.detectionP1': 'It checks for all three keys, listens for a fresh attack, and uses the lowest key it hears to tell inversions apart.',
      'mic.detectionP2': 'If the room, instrument, or microphone makes the evidence unclear, it asks to try again instead of assigning a colour.',

      // ---- errors / retry messages ---------------------------------------
      'errors.startError': 'The piano needs the internet the first time — check your connection and try again.',
      'errors.micNotGranted': 'Microphone access was not granted. Please try again or change the real piano setting.',
      'errors.pianoOrMicFailed': 'Could not start the piano or microphone. Please try again.',
      'errors.micBrowserUnsupported': "This browser can't access the microphone here — real piano mode needs a modern browser.",
      'errors.micAccessDenied': "Chord Garden can't hear the piano without microphone access — check your browser's site settings and try again.",
      'errors.micNoInput': 'No microphone signal reached the app. Check the selected input and microphone level in your device settings, then try again.',
      'errors.micUnavailable': 'Microphone input is unavailable. Check microphone access, then use {allDone} and start again.',
      'errors.micUnmatched': 'Sound reached the microphone, but the chord could not be matched. Release the keys, tap {tryAgain}, and wait for the piano prompt before playing all three keys together.',

      // ---- Celebration (child celebration) --------------------------------
      'celebrate.niceListening': 'Nice listening!',
      'celebrate.youDidIt': 'You did it!',
      'celebrate.home': 'Home',
      'celebrate.waterHint': 'Tap the can to water your flower',
      'celebrate.waterAria': 'Water your flower',
      'celebrate.itGrew': 'It grew!',
      'celebrate.lovesIt': 'Your flower loves it!',
      'celebrate.bloomed': 'Your flower bloomed!',

      // ---- PIN gate --------------------------------------------------------
      'pin.grownUpsOnly': 'Grown-ups only',
      'pin.noMatch': 'That PIN didn’t match. Try again.',
      'pin.backToPlay': 'Back to play',
      'pin.demoHint': 'Demo PIN: {pin}',
      'pin.enterHint': 'Enter your 4-digit PIN',
      'pin.delete': 'Delete',

      // ---- Guardian shell ----------------------------------------------
      'guardian.tabColours': 'Colours',
      'guardian.tabProgress': 'Progress',
      'guardian.tabChildren': 'Children',
      'guardian.tabSettings': 'Settings',
      'guardian.sectionsAria': 'Grown-up sections',
      'guardian.done': 'Done',
      'guardian.area': 'Grown-up area',

      // ---- Guardian: Colours -----------------------------------------------
      'colors.allAdded': 'All colours added',
      'colors.practisingFullSet': '{name} is practising the full set.',
      'colors.readyForNext': 'Ready for {color}',
      'colors.someReady.one': '{ready} of {count} colour ready',
      'colors.someReady.other': '{ready} of {count} colours ready',
      'colors.recognisingReliably': '{name} is recognising every current colour reliably.',
      'colors.addNextHint': 'Add {color} once every colour is at 90% or better over its recent tries.',
      'colors.addButton': 'Add {color}',
      'colors.lockedTitle': 'At least one colour stays on',
      'colors.chordTitle': 'Chord (grown-up only)',
      'colors.chordAndNotes': 'Chord {chord} · {notes}',
      'colors.next': 'Next',
      'colors.practisingSection': 'Practising ({count})',
      'colors.lastOneHint': 'At least one colour always stays on.',
      'colors.percentagesHint': 'Percentages are right-first-time over each colour’s last 20 tries. Tap a colour to turn it off.',
      'colors.upNext': 'Up next',
      'colors.upNextHint': 'The method adds these one at a time, in this order.',
      'colors.advanced': 'Advanced',
      'colors.advancedHint': 'The remaining major chords, for after the first nine.',
      'colors.howIntroducedSummary': 'How colours are introduced',
      'colors.howIntroducedP1': 'Each colour always stands for the same chord. Introduce new colours one at a time: the classic method adds the next colour only once the current ones are known with near-perfect accuracy, usually about every two weeks.',
      'colors.howIntroducedP2': 'One colour on its own is pure listening for a brand-new learner. Two or more turn it into real practice at telling chords apart.',

      // ---- Guardian: Progress -----------------------------------------------
      'progress.setsToday': 'Sets today',
      'progress.aimFiveSets': 'Aim for about 5 short sets',
      'progress.last14Days': 'Last 14 days',
      'progress.rightFirstTime': '{right} of {seen} right first time',
      'progress.noPracticeYet': 'No practice yet',
      'progress.chartTitle': 'First-try accuracy by day',
      'progress.chartSub': 'Last 14 days of app practice. The line marks 90%, the level for adding a colour.',
      'progress.chartEmpty': 'Practice from the last 14 days will show here.',
      'progress.dayDescribe': '{pct}%, {correct} of {seen} right first time',
      'progress.dayAria': '{day}: {describe}',
      'progress.noPractice': 'No practice',
      'progress.dayColumn': 'Day',
      'progress.accuracyColumn': 'Accuracy',
      'progress.setsPerDay': 'Sets per day',
      'progress.setsPerDayAria': 'Sets per day, last 14 days: {list}',
      'progress.setsTooltip.one': '{day}: {count} set',
      'progress.setsTooltip.other': '{day}: {count} sets',
      'progress.today': 'Today',
      'progress.yesterday': 'Yesterday',
      'progress.eachDotHint': 'Each dot is one set. Aim for about 5 short sets a day.',
      'progress.accuracyByColour': 'Accuracy by colour',
      'progress.allTime': '{correct}/{seen} all time',
      'progress.notTriedYet': 'Not tried yet',
      'progress.rightFirstTimeHint': 'Right first time over each colour’s last 20 tries.',
      'progress.noPracticeRecorded': 'No practice recorded yet. Tap {done}, then let your child play a set.',
      'progress.realPianoPractice': 'Real piano practice',
      'progress.attempts.one': '{count} attempt',
      'progress.attempts.other': '{count} attempts',
      'progress.matched': '{count} matched',
      'progress.realPianoHint': 'Kept out of the accuracy figures above until real-piano detection is validated.',
      'progress.rightOf': '{correct} of {rounds} right',
      'progress.noRoundsFinished': 'No rounds finished',
      'progress.stoppedEarly': 'Stopped early',
      'progress.realPianoBadge': 'Real piano',
      'progress.recentSessions': 'Recent sessions',
      'progress.finishedSetsHere': 'Finished sets will appear here.',
      'progress.mistakenFor': 'mistaken for',
      'progress.countTimes': '{count}×',
      'progress.mixups': 'Mix-ups',
      'progress.mixupsHint': 'The colour that was played, and the colour tapped instead.',
      'progress.exportButton': 'Export progress (JSON)',

      // ---- Guardian: Children (profiles) -------------------------------------
      'children.colourCount.one': '{count} colour',
      'children.colourCount.other': '{count} colours',
      'children.setCount.one': '{count} set',
      'children.setCount.other': '{count} sets',
      'children.summary': '{colours}, {sets}',
      'children.removeAria': 'Remove {name}',
      'children.removeTitle': 'Remove {name}?',
      'children.removeBody': 'This deletes {name}’s colours and progress from this device. It can’t be undone.',
      'children.removeConfirm': 'Remove',
      'children.onThisDevice': 'Children on this device',
      'children.tapToSwitch': 'Tap a child to make them the one playing.',
      'children.namePlaceholder': 'Name',
      'children.nameAria': "Child's name",
      'children.addChildSection': 'Add a child',
      'children.addChildButton': 'Add child',

      // ---- Guardian: Settings -------------------------------------------------
      'settings.roundsPerSet': 'Rounds per set',
      'settings.practiceSection': 'Practice',
      'settings.practiceHint': 'A standard set is 20 rounds, about 2–3 minutes. Short, frequent sets work best.',
      'settings.picturesAria': 'Pictures on the flags',
      'settings.flagsSection': 'Flags',
      'settings.flagsHint': 'Each colour has its own picture, like an apple for red and a star for yellow. It helps a child who finds some colours hard to tell apart: about 1 in 12 boys has some colour blindness. Turn it off for plain colour flags.',
      'settings.listenToRealPiano': 'Listen to a real piano',
      'settings.experimental': 'Experimental',
      'settings.childSection': 'Child',
      'settings.nameTitle': 'Name',
      'settings.lookTitle': 'Look',
      'settings.pinSection': 'Grown-up PIN',
      'settings.newPinTitle': 'New PIN',
      'settings.pinPlaceholder': '••••',
      'settings.pinInvalid': 'Enter exactly 4 digits.',
      'settings.pinSaved': 'Saved. Use the new PIN next time.',
      'settings.pinDemoHint': "The lock screen shows the demo PIN ({pin}) until you set your own. It keeps little fingers out; it isn't real security.",
      'settings.pinHint': 'It keeps little fingers out of this area; it isn’t real security.',
      'settings.progressSection': 'Progress',
      'settings.resetButton': 'Reset this child’s progress',
      'settings.resetTitle': 'Reset {name}’s progress?',
      'settings.resetBody': 'This clears every practice session, accuracy figure, mix-up and garden flower for this child. Their colours and settings stay. It can’t be undone.',
      'settings.resetConfirm': 'Reset progress',
      'settings.aboutP1': 'Chord Garden uses the Eguchi Chord Identification Method: children aged about 2–6 learn absolute pitch by matching piano chords to fixed colours. Practise about 5 short times a day.',
      'settings.aboutP2': 'All data stays on this device.',

      // ---- Settings: About (version + manual update check) ------------------
      'settings.about.section': 'About',
      'settings.about.version': 'Version {version}',
      'settings.about.check': 'Check for updates',
      'settings.about.checking': 'Checking…',
      'settings.about.upToDate': 'You’re up to date.',
      'settings.about.updating': 'Updating…',
      'settings.about.offline': 'Couldn’t check. Are you online?',
      'settings.about.unsupported': 'This browser always loads the newest version.',
      'settings.about.updated': 'Updated to version {version}.',
      'settings.about.footnote': 'New versions also install by themselves and switch over the next time the home screen is showing.',

      // ---- Settings: language + note names (new in this change) --------------
      'settings.language.section': 'Language',
      'settings.language.sectionTitle': 'Language and notes',
      'settings.language.automatic': 'Automatic',
      'settings.language.footnoteAuto': "Automatic follows this device's language ({language}).",
      'settings.noteNames.section': 'Note names',
      'settings.noteNames.letters': 'C D E',
      'settings.noteNames.solfege': 'Do Re Mi',
      'settings.noteNames.footnote': 'Chord names in the grown-up area. Automatic uses Do Re Mi in Spanish.',
    },

    es: {
      'app.title': 'Chord Garden — Oído absoluto para niños',
      'child.defaultName': 'Pequeñín',

      'common.cancel': 'Cancelar',
      'common.save': 'Guardar',
      'common.playing': 'Jugando',

      'color.red': 'Rojo',
      'color.yellow': 'Amarillo',
      'color.blue': 'Azul',
      'color.black': 'Negro',
      'color.green': 'Verde',
      'color.orange': 'Naranja',
      'color.purple': 'Morado',
      'color.pink': 'Rosa',
      'color.brown': 'Marrón',
      'color.gray': 'Gris',
      'color.tan': 'Beige',
      'color.lightgreen': 'Verde claro',
      'color.lightpurple': 'Lila',
      'color.skyblue': 'Celeste',

      'avatar.fox': 'Zorro',
      'avatar.cat': 'Gato',
      'avatar.bear': 'Oso',
      'avatar.panda': 'Panda',
      'avatar.frog': 'Rana',
      'avatar.owl': 'Búho',
      'avatar.penguin': 'Pingüino',
      'avatar.bunny': 'Conejito',
      'avatar.pig': 'Cerdito',
      'avatar.koala': 'Koala',
      'avatar.lion': 'León',

      'flower.today': 'La flor de hoy: {stage}',
      'flower.stage.0': 'todavía sin plantar',
      'flower.stage.1': 'una semilla',
      'flower.stage.2': 'un brote',
      'flower.stage.3': 'con hojas',
      'flower.stage.4': 'un capullo',
      'flower.stage.5': 'en flor',

      'home.play': 'Jugar',
      'home.playAgain': 'Jugar otra vez',
      'home.wakingPiano': 'Despertando el piano…',
      'home.brandTitle': 'Chord Garden',
      'home.brandSub': 'Escucha y elige la bandera',
      'home.tapFlagHint': 'Toca una bandera para oír su canción',
      'home.whoIsPlaying': '¿Quién está jugando?',
      'home.grownUpsTitle': 'Adultos',

      'practice.roundsPlayed': 'Rondas jugadas',
      'practice.listenAgain': 'Escuchar otra vez',
      'practice.hearAgain': 'Oírlo otra vez',
      'practice.allDone': 'Ya está',
      'practice.micLevel': 'Nivel del micrófono',

      'mic.realPianoMode': 'Modo piano real',
      'mic.explainer': 'Un adulto toca acordes en un piano real cerca de este dispositivo. Chord Garden escucha por el micrófono para averiguar qué acorde sonó, y tu hijo o hija toca el color.',
      'mic.privacyNote': 'El sonido se analiza aquí mismo, en el navegador, y nunca se graba, se guarda ni se envía a ningún sitio.',
      'mic.notNow': 'Ahora no',
      'mic.ready': 'Listo',
      'mic.paused': 'En pausa',
      'mic.checkingInput': 'Comprobando el sonido…',
      'mic.soundDetected': 'Sonido detectado',
      'mic.inputQuiet': 'Sonido bajo',
      'mic.inputUnavailable': 'Sin entrada de sonido',
      'mic.gotIt': '¡Lo he oído!',
      'mic.playAnyColour': '¡Toca cualquier color en el piano!',
      'mic.getReady': 'Prepárate…',
      'mic.listening': 'Chord Garden está escuchando.',
      'mic.waitingQuiet': 'Esperando un momento de silencio.',
      'mic.tryAgain': 'Inténtalo de nuevo',
      'mic.skipThisOne': 'Saltar esta ronda',
      'mic.howDetectionWorks': 'Cómo funciona la detección con piano real',
      'mic.detectionP1': 'Comprueba que suenan las tres teclas, espera a que se pulsen de nuevo y usa la nota más grave que oye para distinguir las inversiones.',
      'mic.detectionP2': 'Si la habitación, el instrumento o el micrófono no permiten oírlo con claridad, pide intentarlo de nuevo en vez de asignar un color.',

      'errors.startError': 'El piano necesita internet la primera vez: comprueba tu conexión e inténtalo de nuevo.',
      'errors.micNotGranted': 'No se concedió acceso al micrófono. Inténtalo de nuevo o cambia el ajuste de piano real.',
      'errors.pianoOrMicFailed': 'No se pudo iniciar el piano o el micrófono. Inténtalo de nuevo.',
      'errors.micBrowserUnsupported': 'Este navegador no puede usar el micrófono aquí: el modo piano real necesita un navegador moderno.',
      'errors.micAccessDenied': 'Chord Garden no puede oír el piano sin acceso al micrófono: revisa los permisos del sitio en tu navegador e inténtalo de nuevo.',
      'errors.micNoInput': 'No llegó ninguna señal de micrófono a la app. Revisa la entrada seleccionada y el nivel del micrófono en los ajustes de tu dispositivo, y vuelve a intentarlo.',
      'errors.micUnavailable': 'La entrada del micrófono no está disponible. Revisa el acceso al micrófono y usa {allDone} para volver a empezar.',
      'errors.micUnmatched': 'El sonido llegó al micrófono, pero no se pudo reconocer el acorde. Suelta las teclas, toca {tryAgain} y espera la señal del piano antes de tocar las tres teclas juntas.',

      'celebrate.niceListening': '¡Qué bien escuchas!',
      'celebrate.youDidIt': '¡Lo lograste!',
      'celebrate.home': 'Inicio',
      'celebrate.waterHint': 'Toca la regadera para regar tu flor',
      'celebrate.waterAria': 'Riega tu flor',
      'celebrate.itGrew': '¡Ha crecido!',
      'celebrate.lovesIt': '¡A tu flor le encanta!',
      'celebrate.bloomed': '¡Tu flor ha florecido!',

      'pin.grownUpsOnly': 'Solo para adultos',
      'pin.noMatch': 'Ese PIN no coincide. Inténtalo de nuevo.',
      'pin.backToPlay': 'Volver a jugar',
      'pin.demoHint': 'PIN de prueba: {pin}',
      'pin.enterHint': 'Introduce tu PIN de 4 dígitos',
      'pin.delete': 'Borrar',

      'guardian.tabColours': 'Colores',
      'guardian.tabProgress': 'Progreso',
      'guardian.tabChildren': 'Niños',
      'guardian.tabSettings': 'Ajustes',
      'guardian.sectionsAria': 'Secciones de adultos',
      'guardian.done': 'Hecho',
      'guardian.area': 'Área de adultos',

      'colors.allAdded': 'Todos los colores añadidos',
      'colors.practisingFullSet': '{name} ya practica todos los colores.',
      'colors.readyForNext': 'Listo para añadir {color}',
      'colors.someReady.one': '{ready} de {count} color listo',
      'colors.someReady.other': '{ready} de {count} colores listos',
      'colors.recognisingReliably': '{name} está reconociendo todos los colores actuales de forma fiable.',
      'colors.addNextHint': 'Añade {color} cuando todos los colores estén al 90% o más en sus intentos recientes.',
      'colors.addButton': 'Añadir {color}',
      'colors.lockedTitle': 'Al menos un color se queda activo',
      'colors.chordTitle': 'Acorde (solo para adultos)',
      'colors.chordAndNotes': 'Acorde {chord} · {notes}',
      'colors.next': 'Siguiente',
      'colors.practisingSection': 'Practicando ({count})',
      'colors.lastOneHint': 'Al menos un color siempre se queda activo.',
      'colors.percentagesHint': 'Los porcentajes son aciertos a la primera en los últimos 20 intentos de cada color. Toca un color para desactivarlo.',
      'colors.upNext': 'A continuación',
      'colors.upNextHint': 'El método añade estos colores de uno en uno, en este orden.',
      'colors.advanced': 'Avanzados',
      'colors.advancedHint': 'Los acordes mayores restantes, para después de los primeros nueve.',
      'colors.howIntroducedSummary': 'Cómo se introducen los colores',
      'colors.howIntroducedP1': 'Cada color representa siempre el mismo acorde. Introduce los colores nuevos de uno en uno: el método clásico añade el siguiente color solo cuando los actuales se reconocen con una precisión casi perfecta, normalmente cada dos semanas.',
      'colors.howIntroducedP2': 'Un solo color es pura escucha para quien empieza. Dos o más lo convierten en práctica real para distinguir acordes.',

      'progress.setsToday': 'Sesiones de hoy',
      'progress.aimFiveSets': 'El objetivo son unas 5 sesiones cortas',
      'progress.last14Days': 'Últimos 14 días',
      'progress.rightFirstTime': '{right} de {seen} acertados a la primera',
      'progress.noPracticeYet': 'Todavía no ha practicado',
      'progress.chartTitle': 'Precisión a la primera por día',
      'progress.chartSub': 'Últimos 14 días de práctica en la app. La línea marca el 90%, el nivel para añadir un color.',
      'progress.chartEmpty': 'Aquí aparecerá la práctica de los últimos 14 días.',
      'progress.dayDescribe': '{pct}%, {correct} de {seen} acertados a la primera',
      'progress.dayAria': '{day}: {describe}',
      'progress.noPractice': 'Sin práctica',
      'progress.dayColumn': 'Día',
      'progress.accuracyColumn': 'Precisión',
      'progress.setsPerDay': 'Sesiones por día',
      'progress.setsPerDayAria': 'Sesiones por día, últimos 14 días: {list}',
      'progress.setsTooltip.one': '{day}: {count} sesión',
      'progress.setsTooltip.other': '{day}: {count} sesiones',
      'progress.today': 'Hoy',
      'progress.yesterday': 'Ayer',
      'progress.eachDotHint': 'Cada punto es una sesión. El objetivo son unas 5 sesiones cortas al día.',
      'progress.accuracyByColour': 'Precisión por color',
      'progress.allTime': '{correct}/{seen} en total',
      'progress.notTriedYet': 'Todavía sin practicar',
      'progress.rightFirstTimeHint': 'Aciertos a la primera en los últimos 20 intentos de cada color.',
      'progress.noPracticeRecorded': 'Todavía no hay práctica registrada. Toca {done} y deja que tu hijo o hija juegue una sesión.',
      'progress.realPianoPractice': 'Práctica con piano real',
      'progress.attempts.one': '{count} intento',
      'progress.attempts.other': '{count} intentos',
      'progress.matched': 'Reconocidos: {count}',
      'progress.realPianoHint': 'No se incluye en las cifras de precisión de arriba hasta validar la detección con piano real.',
      'progress.rightOf': '{correct} de {rounds} acertadas',
      'progress.noRoundsFinished': 'Ninguna ronda terminada',
      'progress.stoppedEarly': 'Parada antes de tiempo',
      'progress.realPianoBadge': 'Piano real',
      'progress.recentSessions': 'Sesiones recientes',
      'progress.finishedSetsHere': 'Aquí aparecerán las sesiones terminadas.',
      'progress.mistakenFor': 'confundido con',
      'progress.countTimes': '{count}×',
      'progress.mixups': 'Confusiones',
      'progress.mixupsHint': 'El color que sonó, y el color que se tocó en su lugar.',
      'progress.exportButton': 'Exportar progreso (JSON)',

      'children.colourCount.one': '{count} color',
      'children.colourCount.other': '{count} colores',
      'children.setCount.one': '{count} sesión',
      'children.setCount.other': '{count} sesiones',
      'children.summary': '{colours}, {sets}',
      'children.removeAria': 'Eliminar a {name}',
      'children.removeTitle': '¿Eliminar a {name}?',
      'children.removeBody': 'Esto elimina los colores y el progreso de {name} en este dispositivo. No se puede deshacer.',
      'children.removeConfirm': 'Eliminar',
      'children.onThisDevice': 'Niños en este dispositivo',
      'children.tapToSwitch': 'Toca un niño para que sea quien juega.',
      'children.namePlaceholder': 'Nombre',
      'children.nameAria': 'Nombre del niño o niña',
      'children.addChildSection': 'Añadir un niño',
      'children.addChildButton': 'Añadir niño',

      'settings.roundsPerSet': 'Rondas por sesión',
      'settings.practiceSection': 'Práctica',
      'settings.practiceHint': 'Una sesión estándar tiene 20 rondas, unos 2–3 minutos. Funciona mejor con sesiones cortas y frecuentes.',
      'settings.picturesAria': 'Dibujos en las banderas',
      'settings.flagsSection': 'Banderas',
      'settings.flagsHint': 'Cada color tiene su propio dibujo, como una manzana para el rojo y una estrella para el amarillo. Ayuda a un niño o niña a quien le cueste distinguir algunos colores: alrededor de 1 de cada 12 niños varones tiene algún tipo de daltonismo. Desactívalo para banderas de color liso.',
      'settings.listenToRealPiano': 'Escuchar un piano real',
      'settings.experimental': 'Experimental',
      'settings.childSection': 'Niño o niña',
      'settings.nameTitle': 'Nombre',
      'settings.lookTitle': 'Aspecto',
      'settings.pinSection': 'PIN de adultos',
      'settings.newPinTitle': 'PIN nuevo',
      'settings.pinPlaceholder': '••••',
      'settings.pinInvalid': 'Introduce exactamente 4 dígitos.',
      'settings.pinSaved': 'Guardado. Usa el PIN nuevo la próxima vez.',
      'settings.pinDemoHint': 'La pantalla de bloqueo muestra el PIN de prueba ({pin}) hasta que pongas el tuyo. Mantiene alejados a los deditos curiosos; no es seguridad real.',
      'settings.pinHint': 'Mantiene alejados a los deditos curiosos de esta zona; no es seguridad real.',
      'settings.progressSection': 'Progreso',
      'settings.resetButton': 'Reiniciar el progreso de este niño o niña',
      'settings.resetTitle': '¿Reiniciar el progreso de {name}?',
      'settings.resetBody': 'Se borran todas las sesiones, las cifras de precisión, las confusiones y las flores del jardín de este niño o niña. Sus colores y ajustes se mantienen. No se puede deshacer.',
      'settings.resetConfirm': 'Reiniciar progreso',
      'settings.aboutP1': 'Chord Garden usa el método de identificación de acordes de Eguchi: los niños de unos 2 a 6 años desarrollan el oído absoluto asociando acordes de piano a colores fijos. Practica unas 5 veces al día, en sesiones cortas.',
      'settings.aboutP2': 'Todos los datos se quedan en este dispositivo.',

      'settings.about.section': 'Acerca de',
      'settings.about.version': 'Versión {version}',
      'settings.about.check': 'Buscar actualizaciones',
      'settings.about.checking': 'Buscando…',
      'settings.about.upToDate': 'Ya tienes la última versión.',
      'settings.about.updating': 'Actualizando…',
      'settings.about.offline': 'No se pudo comprobar. ¿Tienes conexión?',
      'settings.about.unsupported': 'Este navegador siempre carga la última versión.',
      'settings.about.updated': 'Actualizada a la versión {version}.',
      'settings.about.footnote': 'Las versiones nuevas también se instalan solas y se aplican la próxima vez que aparece la pantalla de inicio.',

      'settings.language.section': 'Idioma',
      'settings.language.sectionTitle': 'Idioma y notas',
      'settings.language.automatic': 'Automático',
      'settings.language.footnoteAuto': 'Automático sigue el idioma de este dispositivo ({language}).',
      'settings.noteNames.section': 'Nombres de las notas',
      'settings.noteNames.letters': 'C D E',
      'settings.noteNames.solfege': 'Do Re Mi',
      'settings.noteNames.footnote': 'Nombres de los acordes en la zona de adultos. Automático usa Do Re Mi en español.',
    },
  };

  let currentLanguage = 'en';
  let noteNamesPref = 'auto'; // 'auto' | 'letters' | 'solfege' — re-resolved on every read, see noteNames() below

  // First whose base subtag (`es-MX` -> `es`) we support wins; falls back to
  // English when nothing in the list matches (including an empty list).
  function detectLanguage(nav = (typeof navigator !== 'undefined' ? navigator : {})) {
    const tags = (nav && nav.languages && nav.languages.length) ? nav.languages
      : (nav && nav.language ? [nav.language] : []);
    for (const tag of tags) {
      const base = String(tag).slice(0, 2).toLowerCase();
      if (SUPPORTED.includes(base)) return base;
    }
    return 'en';
  }

  function setLanguage(pref) {
    currentLanguage = SUPPORTED.includes(pref) ? pref : detectLanguage();
    // Guarded so this module can also run standalone in Node (tests) where
    // there is no DOM at all.
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLanguage;
    }
    if (typeof document !== 'undefined') {
      document.title = t('app.title');
    }
  }
  function language() { return currentLanguage; }

  function setNoteNames(pref) {
    noteNamesPref = (pref === 'letters' || pref === 'solfege') ? pref : 'auto';
  }
  // Auto follows the CURRENT language, resolved fresh on every call (not
  // cached at setNoteNames time) so switching the language alone updates it.
  function noteNames() {
    if (noteNamesPref === 'letters' || noteNamesPref === 'solfege') return noteNamesPref;
    return currentLanguage === 'es' ? 'solfege' : 'letters';
  }

  function t(key, params) {
    const table = STRINGS[currentLanguage] || {};
    const raw = (key in table) ? table[key] : ((key in STRINGS.en) ? STRINGS.en[key] : key);
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? params[name] : whole));
  }

  // Picks key+'.one' or key+'.other' via Intl.PluralRules (anything other
  // than 'one' — 'few'/'many'/'zero'/'other' — collapses to 'other', which is
  // all English/Spanish ever need). {count} is always available to the
  // template; extra params merge in alongside it.
  function plural(key, count, params) {
    const category = new Intl.PluralRules(currentLanguage).select(count) === 'one' ? 'one' : 'other';
    return t(key + '.' + category, Object.assign({ count }, params));
  }

  function color(name) { return t('color.' + name); }

  // Fixed-do solfège throughout (both languages use "Si" for B, never "Ti").
  const LETTERS = { C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'B' };
  const SOLFEGE = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  const NOTE_RE = /^([A-G])([#b]?)(\d*)$/; // trailing octave digits (the \d* group) are dropped

  function note(name) {
    const m = NOTE_RE.exec(name);
    if (!m) return name; // unrecognised input passes through rather than vanishing
    const [, letter, accidental] = m;
    const base = noteNames() === 'solfege' ? SOLFEGE[letter] : LETTERS[letter];
    return base + (accidental === '#' ? '♯' : accidental === 'b' ? '♭' : '');
  }

  // Chord symbols from data.js ('C', 'F/C', 'Bb', ...): each slash-separated
  // part is its own note.
  function chord(symbol) {
    return String(symbol).split('/').map(note).join('/');
  }

  // A list of scientific pitch names, low to high as given, space-separated.
  function notes(list) {
    return (list || []).map(note).join(' ');
  }

  function date(ts, options) { return new Date(ts).toLocaleDateString(currentLanguage, options); }
  function time(ts, options) { return new Date(ts).toLocaleTimeString(currentLanguage, options); }

  // Boot straight into the browser's language (no DOM writes yet — the app
  // hasn't rendered anything, and the real page's <title>/lang get set again
  // once Store's saved preference is known, see js/app.js's boot sequence).
  setLanguage('auto');

  return {
    LANGUAGES, t, plural, color, note, chord, notes, date, time,
    setLanguage, language, detectLanguage, setNoteNames, noteNames,
    _strings: STRINGS, // test-only: tests/i18n.test.mjs's en/es parity check
  };
})();
