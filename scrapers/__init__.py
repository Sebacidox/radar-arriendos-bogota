"""Paquete de extractores modulares para portales inmobiliarios de Bogotá."""

from .ciencuadras import scrape_ciencuadras
from .fincaraiz import scrape_fincaraiz
from .metrocuadrado import scrape_metrocuadrado
from .properati import scrape_properati

__all__ = [
    "scrape_fincaraiz",
    "scrape_metrocuadrado",
    "scrape_ciencuadras",
    "scrape_properati",
]
