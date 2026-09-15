"""Helpers for building a lookup table over a collection of widgets."""


def normalize(name):
    """Return the canonical form of a widget name."""
    return name.strip().lower()


def build_index(widgets):
    """Build a lookup table keyed by each widget's normalized name."""
    index = {}
    for widget in widgets:
        index[normalize(widget.name)] = widget
    return index
