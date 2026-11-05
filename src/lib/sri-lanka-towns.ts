/**
 * Common towns per Sri Lankan district for a friendly, restricted dropdown.
 * This is a curated selection, NOT an exhaustive gazetteer. Users of smaller
 * towns can choose Other town and type their real location, without losing
 * access to seller verification or having their data silently altered.
 */
export const districtTowns: Record<string, readonly string[]> = {
  Colombo: ["Colombo", "Dehiwala", "Mount Lavinia", "Nugegoda", "Maharagama", "Homagama", "Kottawa", "Kaduwela", "Battaramulla", "Moratuwa", "Piliyandala", "Boralesgamuwa", "Avissawella"],
  Gampaha: ["Gampaha", "Negombo", "Ja-Ela", "Wattala", "Kadawatha", "Ragama", "Kelaniya", "Kiribathgoda", "Katunayake", "Seeduwa", "Minuwangoda", "Mirigama", "Divulapitiya"],
  Kalutara: ["Kalutara", "Panadura", "Horana", "Bandaragama", "Beruwala", "Aluthgama", "Matugama", "Agalawatta", "Wadduwa", "Ingiriya"],
  Kandy: ["Kandy", "Peradeniya", "Gampola", "Nawalapitiya", "Katugastota", "Kundasale", "Akurana", "Digana", "Wattegama", "Pilimathalawa", "Kadugannawa"],
  Matale: ["Matale", "Dambulla", "Galewela", "Naula", "Rattota", "Ukuwela", "Sigiriya", "Palapathwela"],
  "Nuwara Eliya": ["Nuwara Eliya", "Hatton", "Talawakele", "Kotagala", "Nanu Oya", "Ginigathhena", "Walapane", "Hanguranketha", "Ragala"],
  Galle: ["Galle", "Hikkaduwa", "Ambalangoda", "Elpitiya", "Baddegama", "Karapitiya", "Bentota", "Ahangama", "Unawatuna", "Balapitiya"],
  Matara: ["Matara", "Weligama", "Akuressa", "Kamburupitiya", "Dikwella", "Hakmana", "Devinuwara", "Deniyaya", "Mirissa"],
  Hambantota: ["Hambantota", "Tangalle", "Tissamaharama", "Ambalantota", "Beliatta", "Weeraketiya", "Kataragama", "Sooriyawewa"],
  Jaffna: ["Jaffna", "Chavakachcheri", "Point Pedro", "Nallur", "Kopay", "Chunnakam", "Karainagar", "Velanai"],
  Kilinochchi: ["Kilinochchi", "Paranthan", "Poonakary", "Pallai", "Akkarayankulam"],
  Mannar: ["Mannar", "Pesalai", "Murunkan", "Nanattan", "Talaimannar", "Adampan"],
  Mullaitivu: ["Mullaitivu", "Puthukkudiyiruppu", "Oddusuddan", "Mankulam", "Mallavi", "Thunukkai"],
  Vavuniya: ["Vavuniya", "Cheddikulam", "Nedunkeni", "Omanthai", "Poovarasankulam"],
  Trincomalee: ["Trincomalee", "Kinniya", "Mutur", "Kantale", "Nilaveli", "Seruwila", "Thampalakamam"],
  Batticaloa: ["Batticaloa", "Kattankudy", "Eravur", "Valachchenai", "Kaluwanchikudy", "Vakarai", "Chenkalady"],
  Ampara: ["Ampara", "Kalmunai", "Akkaraipattu", "Sammanthurai", "Pottuvil", "Sainthamaruthu", "Uhana", "Maha Oya", "Dehiattakandiya"],
  Kurunegala: ["Kurunegala", "Kuliyapitiya", "Narammala", "Polgahawela", "Wariyapola", "Mawathagama", "Nikaweratiya", "Pannala", "Galgamuwa"],
  Puttalam: ["Puttalam", "Chilaw", "Wennappuwa", "Marawila", "Nattandiya", "Dankotuwa", "Anamaduwa", "Kalpitiya", "Mundalama"],
  Anuradhapura: ["Anuradhapura", "Kekirawa", "Thambuttegama", "Medawachchiya", "Mihintale", "Nochchiyagama", "Eppawala", "Galenbindunuwewa"],
  Polonnaruwa: ["Polonnaruwa", "Kaduruwela", "Hingurakgoda", "Medirigiriya", "Bakamuna", "Welikanda", "Aralaganwila"],
  Badulla: ["Badulla", "Bandarawela", "Ella", "Haputale", "Welimada", "Mahiyanganaya", "Passara", "Hali-Ela", "Diyatalawa"],
  Monaragala: ["Monaragala", "Wellawaya", "Bibile", "Buttala", "Siyambalanduwa", "Thanamalwila", "Medagama"],
  Ratnapura: ["Ratnapura", "Embilipitiya", "Balangoda", "Pelmadulla", "Kuruwita", "Eheliyagoda", "Kahawatta", "Rakwana", "Godakawela", "Kalawana"],
  Kegalle: ["Kegalle", "Mawanella", "Warakapola", "Rambukkana", "Ruwanwella", "Dehiowita", "Yatiyantota", "Deraniyagala", "Aranayake"],
};

export const sriLankaDistricts = Object.keys(districtTowns);
export const otherTownValue = "__other__";

export function townsForDistrict(district: string): readonly string[] {
  return districtTowns[district] ?? [];
}

export function isKnownTown(district: string, city: string): boolean {
  return townsForDistrict(district).includes(city);
}
