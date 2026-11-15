# ISO Studio

Τοπική εφαρμογή για παραμετροποίηση εικόνων Linux Live για υπολογιστές x86‑64. Η διανομή καθορίζει ποιοι kernel, γραφικά περιβάλλοντα και εργαλεία δημιουργίας είναι διαθέσιμα.

| Διανομή | Επιλογές kernel | Εργαλείο |
| --- | --- | --- |
| Debian 13 | Standard, Real-time | [Debian live-build](https://live-team.pages.debian.net/live-manual/html/live-manual.en.html) |
| Ubuntu 24.04 LTS | Generic, HWE, Low-latency | [Casper](https://manpages.ubuntu.com/manpages/noble/man7/casper.7.html), debootstrap και GRUB |
| Arch Linux | Standard, LTS, Zen, Hardened | [archiso](https://wiki.archlinux.org/title/Archiso) |
| Fedora 44 | Standard, Debug | [Lorax](https://weldr.io/lorax/livemedia-creator.html), σε αποκλειστική VM |

Στην εφαρμογή εμφανίζεται το ακριβές όνομα πακέτου του επιλεγμένου kernel. Η έκδοση του πακέτου προκύπτει από τα αποθετήρια κατά τη δημιουργία. Τα προφίλ Debian, Ubuntu και Fedora προσφέρουν Xfce, GNOME, KDE Plasma ή τερματικό. Το Arch προσφέρει Xfce ή τερματικό.

## Άνοιγμα της εφαρμογής

Με Node.js 22 ή νεότερο εκτέλεσε από αυτόν τον φάκελο:

```sh
node server.mjs
```

Άνοιξε τη διεύθυνση [127.0.0.1:4177](http://127.0.0.1:4177). Η εφαρμογή ακούει μόνο στην τοπική διεύθυνση. Από Windows μπορείς να διαμορφώσεις την εικόνα και να κατεβάσεις το `build-<διανομή>-iso.sh`.

## Εγκατάσταση στα Windows

Κατέβασε και εκτέλεσε το [ISOStudioSetup.exe](https://github.com/Anserb/iso-studio/releases/latest) σε Windows 10 22H2 ή Windows 11 συμβατά με x64. Άνοιξε το **ISO Studio** από το μενού Έναρξη. Το setup περιλαμβάνει τα runtimes Node.js και .NET. Η εφαρμογή χρησιμοποιεί το WebView2 των Windows και προσφέρει άνοιγμα στον προεπιλεγμένο browser αν το WebView2 δεν είναι διαθέσιμο. Η απεγκατάσταση γίνεται από **Ρυθμίσεις → Εφαρμογές → Εγκατεστημένες εφαρμογές**.

Στα Windows μπορείς να διαμορφώσεις την εικόνα και να εξαγάγεις το σενάριο. Η παραγωγή του ISO εκτελείται σε συμβατό περιβάλλον Linux.

## Επεξεργασία στο Visual Studio

Άνοιξε το `ISOStudio.slnx` στο Visual Studio 2026 με το workload **.NET desktop development** και εγκατεστημένο Node.js 22 ή νεότερο στο PATH. Πάτησε **F5** για εκτέλεση. Στο **Solution Explorer → ISOStudio.Windows → app** βρίσκονται τα αρχεία HTML, CSS και JavaScript. Το `Windows/Program.cs` ορίζει το παράθυρο των Windows.

Για να δημιουργήσεις ξανά το setup, εγκατέστησε Inno Setup 6 και εκτέλεσε από τη ρίζα του αποθετηρίου:

```powershell
.\installer\build-installer.ps1
```

Το εκτελέσιμο δημιουργείται στο `release/ISOStudioSetup.exe`. Ο πηγαίος κώδικας διατίθεται με την [άδεια MIT](LICENSE).

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
sudo -v && node server.mjs
```

Άνοιξε τη σελίδα μέσα από το Linux, επίλεξε τη διανομή που τρέχει στο μηχάνημα και πάτησε **Δημιουργία ISO**. Η εφαρμογή εμφανίζει την καταγραφή και ενεργοποιεί τη λήψη μόλις ολοκληρωθεί. Επιτρέπεται μία δημιουργία κάθε φορά. Τα αρχεία παραμένουν στον φάκελο `builds/`, με ξεχωριστό υποφάκελο ανά δημιουργία. Ο σύνδεσμος λήψης ισχύει όσο τρέχει η ίδια διαδικασία του server.

Αν έχεις ήδη κατεβάσει το σενάριο από άλλη συσκευή, αντέγραψέ το στο αντίστοιχο Linux και εκτέλεσέ το από φάκελο στον οποίο έχεις δικαίωμα εγγραφής. Για παράδειγμα, στο Arch Linux:

```sh
sudo -v && bash build-arch-iso.sh
```

Το αρχείο `<όνομα>-<διανομή>-amd64.iso` εμφανίζεται στον τρέχοντα φάκελο. Σε αποτυχία δες την καταγραφή και τη διαδρομή του προσωρινού καταλόγου που τυπώνει το σενάριο. Μετά από διακοπή έλεγξε με `findmnt` για ενεργές προσαρτήσεις στον προσωρινό κατάλογο πριν τον αφαιρέσεις. Για Debian εκτέλεσε `sudo lb clean --purge` μέσα στον προσωρινό κατάλογο.

Ο ενσωματωμένος εγκαταστάτης είναι επιλογή του Debian. Η εναλλαγή αγγλικού και ελληνικού πληκτρολογίου σε Arch και Fedora αφορά το γραφικό περιβάλλον. Το επίσημο προφίλ Arch περιλαμβάνει τα δικά του πακέτα firmware και εργαλεία εγκατάστασης.
