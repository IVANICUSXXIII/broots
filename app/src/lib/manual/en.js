// Manual de Broots en inglés (ver es.js, que es el original). Mismos temas y mismos id en los tres idiomas.

export const MANUAL = [
  {
    id: 'que-es',
    titulo: 'What Broots is',
    bloques: [
      { texto: 'Broots is your pocket librarian: it helps you organize, find and read your ebooks. It uses the same folder as Calibre, so there’s nothing to import or copy — just show up and read.' },
      { texto: 'Calibre and Broots get along just fine. Whatever you change in one shows up in the other, because both use the same library file (metadata.db).' },
      {
        lista: [
          'Broots never touches that file on its own: every change is made with the official Calibre tools.',
          'Before each change it saves a backup of the database in the .broots/respaldos folder, inside your library.',
          'If Calibre isn’t installed on this PC, Broots downloads its own copy of those tools (you can see it in Settings → Calibre).',
        ],
      },
      { texto: 'Broots is free and open source, with the same license as Calibre (GPL version 3): you can use it, share it and change it. You’ll find it in Settings → About.' },
    ],
  },
  {
    id: 'primeros-pasos',
    titulo: 'Getting started',
    bloques: [
      {
        pasos: [
          'The first time, Broots looks for this PC’s Calibre library. If it can’t find it, click “Choose folder” and pick the folder that has the metadata.db file.',
          'On the left are your libraries (Calibre’s and Family’s) and the filters: authors, tags, series and more.',
          'At the top is the search box: type part of the title, the author or a tag.',
          'Click a book to open its panel, with the cover, the details and what you can do with it: read, edit, send to Kindle or share.',
        ],
      },
      { subtitulo: 'Power searches (Calibre-style)' },
      {
        lista: [
          'tags:novel → books with a tag that contains “novel”.',
          'author:"=Jorge Luis Borges" → that exact author.',
          'rating:>3 → more than three stars.',
          'You can combine them with and, or and not: tags:novel not tags:read.',
        ],
      },
      { texto: 'To use another library folder, cross over to the dark theme (or come back to the light) or choose Broots’ language (Spanish, English or Portuguese), go to Settings → General.' },
    ],
  },
  {
    id: 'agregar',
    titulo: 'Adding and converting books',
    bloques: [
      {
        lista: [
          'Click the “+” in the top bar, or drag the files (EPUB, PDF, MOBI…) onto the Broots window. Whole stacks welcome.',
          'If a book has no EPUB or PDF, its panel shows “Convert to EPUB” or “Convert to PDF”. It may take a little while: perfect time to put the kettle on.',
          'Protected books (DRM) are copied as they are: Broots doesn’t remove their protection or convert them.',
        ],
      },
    ],
  },
  {
    id: 'editar',
    titulo: 'Editing a book’s details',
    bloques: [
      { texto: 'In the book’s panel, click “Edit”. Every detail is there: title, authors, series, tags, dates, publisher, the columns you created in Calibre, the cover and the formats.' },
      {
        lista: [
          '“Find details” brings details and covers from Google Books and Open Library. If you also want it to search Amazon (it usually has better covers), turn it on in Settings → Privacy.',
          'You can also paste the address of the book’s page on any website, and Broots copies its details into the form.',
          'To change the cover, drag an image onto it. That’s all there is to it.',
          'Check what it found and click “Save”. Only the fields you changed are saved: everything else stays as it was.',
        ],
      },
    ],
  },
  {
    id: 'kindle',
    titulo: 'Kindle: sending and highlights',
    bloques: [
      { subtitulo: 'Sending books to your Kindle' },
      {
        pasos: [
          'In Settings → Kindle & email, enter your Gmail address, an app password (see Frequently asked questions) and your Kindle’s @kindle.com address.',
          'On Amazon, go to Manage Your Content and Devices → Preferences → Personal Document Settings and add your Gmail address to the approved email list.',
          'That’s it: each book’s panel now shows “Send to Kindle”.',
        ],
      },
      { texto: 'Amazon accepts EPUB and PDF files up to 50 MB. It no longer accepts MOBI and AZW by email: convert the book to EPUB first.' },
      { subtitulo: 'Importing your highlights' },
      {
        lista: [
          'Connect the Kindle with a USB cable (unlocked), click the Kindle button in the bar and then “Import from Kindle”.',
          'You can also drag the Kindle’s My Clippings.txt file onto the window.',
          'Broots sorts the highlights by book and saves them in your library folder. If it doesn’t recognize a book, it asks you which one it is (and never forgets).',
          'If a book is on the Kindle but not in your library, you can add it from the same sheet.',
        ],
      },
    ],
  },
  {
    id: 'lector',
    titulo: 'Reading and translating',
    bloques: [
      { texto: 'In the panel of an EPUB book, click “Read” to open it in the Broots reader. Comfy armchair not included.' },
      {
        lista: [
          'Turn the page with the ← → arrows, the mouse wheel or a click on either side (no finger-licking required).',
          'At the top you have the table of contents, the font size and the page number: type a number and press Enter to go there.',
          'To translate into Broots’ language, add your Gemini key in Settings → Reading & translation (see Frequently asked questions) and click the reader’s translate button.',
          'Click a translated paragraph to see the original, in case you want to compare.',
          'Esc takes you back to the library.',
        ],
      },
    ],
  },
  {
    id: 'habito',
    titulo: 'Reading habit',
    bloques: [
      { texto: 'Every time you read in the reader, Broots logs the session on its own: how long you actually read and how many pages. The clock pauses after 5 minutes without turning a page or if you minimize the window, so a coffee break doesn’t count as reading.' },
      { subtitulo: 'Reading session' },
      {
        lista: [
          'The hourglass button at the top of the reader has three modes: Free (no clock in sight), Minutes (a goal from 15 to 60) and Until the chapter ends.',
          'Reminders never interrupt mid-paragraph: they only show up when you turn the page.',
          'Eye break (20-20-20 rule): every 20 minutes, a gentle note invites you to look at something far away for about 20 seconds. It goes away on its own and you can turn it off in the same button or in Settings → Reading & translation.',
          'At the bottom, next to the percentage, Broots tells you how much is left in the chapter and the book, based on your actual pace.',
        ],
      },
      { subtitulo: 'Focus mode' },
      { texto: 'Press F (or the four-corners button) and you get just the text, full screen. Move the mouse to the top or bottom edge to peek at the bars. F or Esc take you back.' },
      { subtitulo: 'My reading' },
      {
        lista: [
          'The flame button in the top bar opens your stats: daily streak, hours this month, pace, books finished, the yearly heat map and the time of day you read.',
          '"Reading now" lists the books you’re in the middle of and how much is left. If one hasn’t been opened in over 30 days, Broots suggests moving it to Paused (it never changes it on its own).',
        ],
      },
      { subtitulo: 'Status and rereads' },
      {
        lista: [
          'Statuses are To read, Reading, Paused, Read and Abandoned, and they’re saved in Calibre. If your library has no such column, "My reading" offers to create it: it uses Calibre’s official tool, asks for your OK first and backs up the database.',
          'If your column already exists but has no "Paused" option, Broots explains how to add it in Calibre (Calibre’s tools don’t allow doing it from outside).',
          'After 5 minutes reading a "To read" book, it moves to "Reading" on its own and lets you know. When you reach the last page, Broots offers to mark it as read.',
          'A finished book’s panel shows "Reread": it starts a new read from the beginning and your previous reading stays saved separately.',
          'Sessions live in your library’s .broots/habito folder. In Settings → Reading & translation you can stop tracking them or delete your stats (Broots keeps a copy, just in case).',
        ],
      },
    ],
  },
  {
    id: 'club',
    titulo: 'Book club',
    bloques: [
      { texto: 'To talk about a book with an artificial intelligence that has read your highlights. Like a book club, minus the scheduling.' },
      {
        pasos: [
          'In the book’s panel, click “Take to book club”. Broots creates a .md file with the book’s details and your highlights, and opens the folder for you.',
          'Drag that file into your Claude Project or into NotebookLM.',
          'The first time, the Book club sheet explains how to set up the Claude Project or the Gemini skill: you paste the instructions and fill in the “Who I am” part. You only do it once.',
        ],
      },
    ],
  },
  {
    id: 'familia',
    titulo: 'Family',
    bloques: [
      { texto: 'To share books with the people at home. Each member has their own library inside Broots: the books with their tag (for example, “For Ana”). To each their own shelf.' },
      {
        pasos: [
          'Click the Family button in the bar (or go to Settings → Family) and add someone with their name.',
          'Mark their books: in each book’s panel, under “Share with”, click their name. You can also add a whole library at once.',
          'Click “Update copy”. Broots builds a copy with only their books in your Google Drive (in the “Broots shared” folder). Your library isn’t touched.',
          'In Google Drive, share that folder with their email as “Viewer”. They can see it in the Drive app, or with Broots on a PC, in read-only mode.',
        ],
      },
      { texto: 'If you add their Kindle address, each book’s panel shows their name next to “Also send to”.' },
    ],
  },
  {
    id: 'duplicados',
    titulo: 'Repeated books',
    bloques: [
      {
        lista: [
          'Click the duplicates button in the bar: Broots looks for books that are there twice, like twins separated at birth.',
          'For each case you choose which one to keep. Any formats and highlights only the other one had move to the one you keep.',
          'The one you discard goes to the Calibre trash: if you made a mistake, you can get it back from Calibre.',
        ],
      },
    ],
  },
  {
    id: 'actualizaciones',
    titulo: 'Updates',
    bloques: [
      { texto: 'Broots updates itself. Every time you open it (and every six hours if it stays open) it asks GitHub whether there’s a new version; if there is, it downloads it quietly and checks that it arrived intact.' },
      {
        lista: [
          'When the new version is ready, a notice appears in the middle of the screen. If you’re reading, it waits until you close the book.',
          '“Restart now” installs it in a few seconds and opens Broots again. “Later” leaves it for when you close Broots.',
          'The first time you open the new version there’s a little party: confetti, a party horn and what changed.',
          'Your books, settings and keys stay just as they were.',
        ],
      },
      { texto: 'In Settings → Updates you can check for a new version anytime, or turn off automatic updates or the party horn.' },
    ],
  },
  {
    id: 'atajos',
    titulo: 'Keyboard shortcuts',
    bloques: [
      {
        teclas: [
          [['/', 'Ctrl+F'], 'Go to the search box'],
          [['Ctrl+B'], 'Show or hide the sidebar'],
          [['Esc'], 'Close the panel, the large cover or the open sheet'],
          [['F1'], 'Open this help (yes, this one)'],
          [['←', '→'], 'In the reader: previous and next page'],
          [['F'], 'In the reader: focus mode (just the text, full screen)'],
        ],
      },
    ],
  },
  {
    id: 'preguntas',
    titulo: 'Frequently asked questions',
    bloques: [
      {
        preguntas: [
          [
            'It says “Calibre is open or busy”. What do I do?',
            'To save changes, Broots needs Calibre not to be using the library. Close Calibre and try again in a few seconds. If Calibre was already closed, wait a moment: sometimes Windows or the antivirus is checking a newly created file.',
          ],
          [
            'What is a Gmail app password?',
            'Google doesn’t let other programs use your regular password. An app password is a 16-letter key just for Broots: you create it in your Google account (2-Step Verification has to be turned on) and you can delete it whenever you want. Settings → Kindle & email has the button that opens that page.',
          ],
          [
            'How do I get a Gemini key?',
            'It’s free. Go to Google AI Studio with your Google account, create a key (“Create API key”), copy it and paste it in Settings → Reading & translation. The free version has a daily usage limit.',
          ],
          [
            'Where are my keys stored?',
            'The Gmail password and the Gemini key are stored encrypted by Windows on this PC. Broots never shows them again or sends them anywhere else.',
          ],
          [
            'My library is in Google Drive. Do I need to be careful about anything?',
            'Broots works on the folder on your PC, and the Google Drive program uploads it on its own. Avoid changing the library from two PCs at the same time, and if a change doesn’t show up on the other PC, wait for Drive to finish syncing.',
          ],
          [
            'Does Broots remove the protection (DRM) from my books?',
            'No. Protected books are copied as they are, and to read them you need the app or device from the store where you bought them.',
          ],
          [
            'Why can’t a book be sent to the Kindle?',
            'It may be an entry with no file, a book larger than 50 MB or one that is only in MOBI or AZW. In that last case, convert it to EPUB from its panel.',
          ],
          [
            'I made a change by mistake. Can I undo it?',
            'Discarded books are in the Calibre trash. Also, before each change Broots saves a backup of the database in your library’s .broots/respaldos folder.',
          ],
          [
            'When I install Broots, Windows says “Windows protected your PC”. Is it dangerous?',
            'It shows up because the installer doesn’t have a digital signature yet, the seal Windows uses to recognize who made a program. If you downloaded it from the Broots page on GitHub, click “More info” and then “Run anyway”. Automatic updates are verified before they’re installed.',
          ],
        ],
      },
    ],
  },
];
