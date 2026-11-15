# Linux Studio

Τοπική εφαρμογή για παραμετροποίηση εικόνων Linux Live για υπολογιστές x86‑64. Η διανομή καθορίζει ποιοι kernel, γραφικά περιβάλλοντα και εργαλεία δημιουργίας είναι διαθέσιμα.

| Διανομή | Επιλογές kernel | Εργαλείο |
| --- | --- | --- |
| Debian 13 | Standard, Real-time | [Debian live-build](https://live-team.pages.debian.net/live-manual/html/live-manual.en.html) |
| Ubuntu 24.04 LTS | Generic, HWE, Low-latency | [Casper](https://manpages.ubuntu.com/manpages/noble/man7/casper.7.html), debootstrap και GRUB |
| Arch Linux | Standard, LTS, Zen, Hardened | [archiso](https://wiki.archlinux.org/title/Archiso) |
| Fedora 44 | Standard, Debug | [Lorax](https://weldr.io/lorax/livemedia-creator.html), σε αποκλειστική VM |

Στην εφαρμογή εμφανίζεται το ακριβές όνομα πακέτου του επιλεγμένου kernel. Η έκδοση του πακέτου προκύπτει από τα αποθετήρια κατά τη δημιουργία. Τα προφίλ Debian, Ubuntu και Fedora προσφέρουν Xfce, GNOME, KDE Plasma ή τερματικό. Το Arch προσφέρει Xfce ή τερματικό.

## Εγκατάσταση σε Linux

Κατέβασε το [πακέτο Linux Studio](https://linuxstudio.pvgaming.uk/linux-studio-linux.tar.gz).
Χρειάζεσαι [Node.js 22 ή νεότερο](https://nodejs.org/en/download) και `xdg-open` για αυτόματο άνοιγμα του browser.
Από τον φάκελο λήψεων, ως κανονικός χρήστης, εκτέλεσε:

```sh
tar -xzf linux-studio-linux.tar.gz
cd LinuxStudio
node Linux/install.mjs
```

Άνοιξε το **Linux Studio** από το μενού εφαρμογών. Άφησε ανοιχτό το τερματικό που εμφανίζεται όσο χρησιμοποιείς την εφαρμογή. Μπορείς επίσης να την ανοίξεις με `~/.local/bin/linux-studio`. Η εγκατάσταση ισχύει για τον λογαριασμό σου και τα ISO αποθηκεύονται στο `~/.local/share/linux-studio/builds` ή στον αντίστοιχο φάκελο κάτω από το `XDG_DATA_HOME`.

### Άνοιγμα από τον πηγαίο κώδικα

Με Node.js 22 ή νεότερο εκτέλεσε από αυτόν τον φάκελο:

```sh
node server.mjs
```

Άνοιξε τη διεύθυνση [127.0.0.1:4177](http://127.0.0.1:4177). Η εφαρμογή ακούει μόνο στην τοπική διεύθυνση. Από Windows μπορείς να διαμορφώσεις την εικόνα και να κατεβάσεις το `build-<διανομή>-iso.sh`.

Σε Linux, το `node Linux/launch.mjs` ανοίγει αυτόματα τον browser σε ελεύθερη τοπική θύρα. Για ανάπτυξη με .NET 10, χρησιμοποίησε `dotnet run --project Linux/ISOStudio.Linux.csproj`.

## Εγκατάσταση στα Windows

Κατέβασε και εκτέλεσε το [LinuxStudioSetup.exe](https://github.com/Anserb/iso-studio/releases/latest) σε Windows 10 22H2 ή Windows 11 συμβατά με x64. Άνοιξε το **Linux Studio** από το μενού Έναρξη. Το setup περιλαμβάνει τα runtimes Node.js και .NET. Η εφαρμογή χρησιμοποιεί το WebView2 των Windows και προσφέρει άνοιγμα στον προεπιλεγμένο browser αν το WebView2 δεν είναι διαθέσιμο. Η απεγκατάσταση γίνεται από **Ρυθμίσεις → Εφαρμογές → Εγκατεστημένες εφαρμογές**.

Στα Windows μπορείς να διαμορφώσεις την εικόνα και να εξαγάγεις το σενάριο. Η παραγωγή του ISO εκτελείται σε συμβατό περιβάλλον Linux.

## Επεξεργασία στο Visual Studio

Άνοιξε το `ISOStudio.slnx` στο Visual Studio 2026 με το workload **.NET desktop development** και εγκατεστημένο Node.js 22 ή νεότερο στο PATH. Πάτησε **F5** για εκτέλεση. Στο **Solution Explorer → ISOStudio.Windows → app** βρίσκονται τα αρχεία HTML, CSS και JavaScript. Το `Windows/Program.cs` ορίζει το παράθυρο των Windows.

Για να δημιουργήσεις ξανά το setup, εγκατέστησε Inno Setup 6 και εκτέλεσε από τη ρίζα του αποθετηρίου:

```powershell
.\installer\build-installer.ps1
```

Το εκτελέσιμο δημιουργείται στο `release/LinuxStudioSetup.exe`. Ο πηγαίος κώδικας διατίθεται με την [άδεια MIT](LICENSE).

## Δημιουργία ISO

Χρησιμοποίησε Linux x86‑64 που αντιστοιχεί στην επιλεγμένη διανομή, με πρόσβαση στο διαδίκτυο και τουλάχιστον 30 GB ελεύθερου χώρου. Για Fedora χρησιμοποίησε αποκλειστική VM χωρίς δεδομένα που χρειάζεσαι, καθώς το Lorax εκτελεί το Anaconda μέσα στη VM. Εγκατάστησε τα εργαλεία της διανομής που επέλεξες.

### Debian 13

```sh
sudo apt update
sudo apt install sudo live-build debootstrap debian-archive-keyring xorriso squashfs-tools syslinux-common isolinux grub-common grub-efi-amd64-bin
```

### Ubuntu 24.04 LTS

```sh
sudo apt update
sudo apt install sudo debootstrap ubuntu-keyring systemd-container squashfs-tools xorriso mtools grub-common grub-pc-bin grub-efi-amd64-bin
```

### Arch Linux

```sh
sudo pacman -Syu archiso sudo
```

### Fedora 44 σε VM

```sh
sudo dnf install sudo lorax-lmc-novirt
```

### Εκτέλεση

Για δημιουργία από την εφαρμογή, ξεκίνησέ την από διαδραστικό τερματικό ως κανονικός χρήστης. Στο ίδιο τερματικό ενεργοποίησε πρώτα το sudo.

```sh
sudo -v && ~/.local/bin/linux-studio
```

Από τον πηγαίο κώδικα, χρησιμοποίησε `sudo -v && node Linux/launch.mjs`. Επίλεξε τη διανομή που τρέχει στο μηχάνημα και πάτησε **Δημιουργία ISO**. Η εφαρμογή εμφανίζει την καταγραφή και ενεργοποιεί τη λήψη μόλις ολοκληρωθεί. Κάθε δημιουργία έχει δικό της υποφάκελο. Ο σύνδεσμος λήψης ισχύει όσο τρέχει η ίδια διαδικασία του server.

Αν έχεις ήδη κατεβάσει το σενάριο από άλλη συσκευή, αντέγραψέ το στο αντίστοιχο Linux και εκτέλεσέ το από φάκελο στον οποίο έχεις δικαίωμα εγγραφής. Για παράδειγμα, στο Arch Linux:

```sh
sudo -v && bash build-arch-iso.sh
```

Το αρχείο `<όνομα>-<διανομή>-amd64.iso` εμφανίζεται στον τρέχοντα φάκελο. Σε αποτυχία δες την καταγραφή και τη διαδρομή του προσωρινού καταλόγου που τυπώνει το σενάριο. Μετά από διακοπή έλεγξε με `findmnt` για ενεργές προσαρτήσεις στον προσωρινό κατάλογο πριν τον αφαιρέσεις. Για Debian εκτέλεσε `sudo lb clean --purge` μέσα στον προσωρινό κατάλογο.

Ο ενσωματωμένος εγκαταστάτης είναι επιλογή του Debian. Η εναλλαγή αγγλικού και ελληνικού πληκτρολογίου σε Arch και Fedora αφορά το γραφικό περιβάλλον. Το επίσημο προφίλ Arch περιλαμβάνει τα δικά του πακέτα firmware και εργαλεία εγκατάστασης.
