# Συνέχεια του Linux Studio στο Visual Studio

Άνοιξε το `ISOStudio.slnx` στο Visual Studio και πάτησε **F5**. Χρειάζεται το workload **.NET desktop development** και Node.js 22 ή νεότερο στο PATH. Ο πηγαίος κώδικας του παραθύρου βρίσκεται στο `Windows/Program.cs` και τα συνδεδεμένα αρχεία HTML, CSS και JavaScript εμφανίζονται στον φάκελο `app` του Solution Explorer.

Από **View → Terminal**, με τρέχοντα φάκελο το `LinuxIsoStudio`, εκτέλεσε:

```powershell
node server.mjs
```

Χρειάζεται Node.js 22 ή νεότερο. Άνοιξε το [Linux Studio](http://127.0.0.1:4177). Αν ο server ήδη τρέχει στη θύρα 4177, χρησιμοποίησε την ανοιχτή σελίδα. Για να δοκιμάσεις τις τελευταίες αλλαγές στον server παράλληλα, εκτέλεσε `$env:PORT = '4178'; node server.mjs` και άνοιξε το [127.0.0.1:4178](http://127.0.0.1:4178).

## Τι υπάρχει

- `index.html`, `style.css`, `app.mjs` — ελληνικό περιβάλλον επιλογής διανομής, kernel, desktop, γλώσσας, πληκτρολογίου και εφαρμογών.
- `catalog.mjs` — υποστηριζόμενες επιλογές για Debian 13, Ubuntu 24.04 LTS, Arch Linux και Fedora 44.
- `recipe.mjs`, `other-builders.mjs` — έλεγχος διαμόρφωσης και παραγωγή σεναρίου Bash για κάθε διανομή.
- `server.mjs` — τοπικός server, εξαγωγή Bash, εκτέλεση σε συμβατό Linux, καταγραφή και λήψη του ISO.
- [Οδηγίες χρήσης](README.md) — εξαρτήσεις και εκτέλεση ανά διανομή.

Ελέγχθηκαν στον Chrome οι επιλογές και οι λήψεις και για τις τέσσερις διανομές. Ελέγχθηκε η σύνταξη Bash για 36 συνδυασμούς kernel και desktop. Παραμένει εκκρεμής η δημιουργία και εκκίνηση πραγματικού ISO σε κάθε διανομή.

## Windows installer

Το `installer/build-installer.ps1` δημοσιεύει την εφαρμογή μαζί με τα runtimes .NET και Node.js και δημιουργεί το `release/LinuxStudioSetup.exe` μέσω Inno Setup 6. Το παράθυρο των Windows ξεκινά τον τοπικό server σε ελεύθερη θύρα και τον τερματίζει όταν κλείνει. Η παραγωγή του ISO εκτελείται σε συμβατό Linux.
