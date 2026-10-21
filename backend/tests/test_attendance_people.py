from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Person
from app.routers.attendance_pro import _attendance_people_query


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_attendance_roster_includes_active_acs_people_and_excludes_passive_people():
    db = _session()
    db.add_all([
        Person(full_name="Camera Employee", person_type="employee", source="manual"),
        Person(full_name="ACS Active", person_type="employee", source="acs", acs_active=1),
        Person(full_name="ACS Passive", person_type="employee", source="acs", acs_active=0),
        Person(full_name="Unknown", person_type="unknown", source="acs", acs_active=1),
    ])
    db.commit()

    names = {
        person.full_name
        for person in _attendance_people_query(db).all()
    }
    assert names == {"Camera Employee", "ACS Active"}
