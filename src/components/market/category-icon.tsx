import { CarFront, House, Laptop, Shirt, Smartphone, Sofa, Wrench, LayoutGrid } from "lucide-react";
export function CategoryIcon({ icon }: { icon: string }) {
  const cls = "size-8 text-[#33373D]";
  switch (icon) {
    case "smartphone": return <Smartphone className={cls}/>;
    case "car": return <CarFront className={cls}/>;
    case "house": return <House className={cls}/>;
    case "laptop": return <Laptop className={cls}/>;
    case "sofa": return <Sofa className={cls}/>;
    case "shirt": return <Shirt className={cls}/>;
    case "grid": return <LayoutGrid className={cls}/>;
    default: return <Wrench className={cls}/>;
  }
}
