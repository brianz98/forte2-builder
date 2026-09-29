const SYMBOLS = (
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn " +
  "Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce " +
  "Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn " +
  "Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl " +
  "Mc Lv Ts Og"
).split(" ");

const Z = new Map(SYMBOLS.map((s, i) => [s.toLowerCase(), i + 1]));

export interface Atom {
  symbol: string;
  z: number;
}

// Parse Cartesian XYZ text ("El x y z" per line or ";"-separated). Returns
// undefined for anything else, such as Z-matrices.
export function parseAtoms(xyz: string): Atom[] | undefined {
  const atoms: Atom[] = [];
  for (const raw of xyz.split(/[\n;]/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const parts = line.split(/[\s,]+/);
    if (parts.length !== 4 || parts.slice(1).some((p) => Number.isNaN(Number(p)))) {
      return undefined;
    }
    const symbol = parts[0].replace(/[0-9_].*$/, "");
    const z = Z.get(symbol.toLowerCase());
    if (!z) return undefined;
    atoms.push({ symbol: SYMBOLS[z - 1], z });
  }
  return atoms.length ? atoms : undefined;
}

// Hill-order formula, for example "C3H4" or "N2".
export function formula(atoms: Atom[]): string {
  const counts = new Map<string, number>();
  for (const a of atoms) counts.set(a.symbol, (counts.get(a.symbol) ?? 0) + 1);
  const order = [...counts.keys()].sort();
  const hasC = counts.has("C");
  const keys = hasC
    ? ["C", ...(counts.has("H") ? ["H"] : []), ...order.filter((s) => s !== "C" && s !== "H")]
    : order;
  return keys.map((s) => s + (counts.get(s)! > 1 ? counts.get(s) : "")).join("");
}

export function nuclearCharge(atoms: Atom[]): number {
  return atoms.reduce((sum, a) => sum + a.z, 0);
}
