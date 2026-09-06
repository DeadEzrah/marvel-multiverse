export default class MarvelMultiverseItemBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.description = new fields.StringField({ required: true, blank: true });

    
    schema.size = new fields.StringField({ blank: true });
    schema.quantity = new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 });
    
    schema.ability = new fields.StringField({required: true, blank: true});
    schema.attack = new fields.BooleanField({ required: true, initial: false });
    schema.formula = new fields.StringField({required: true,  initial: "{1d6,1dm,1d6}" });
    schema.automationPreset = new fields.StringField({ blank: true });
    schema.effectProfile = new fields.StringField({ blank: true });
    schema.effectProfiles = new fields.ObjectField();
    schema.effectOverrides = new fields.ObjectField();
    schema.targeting = new fields.ObjectField();
    schema.damage = new fields.ObjectField();
    schema.events = new fields.ArrayField(new fields.ObjectField());
    schema.rollModifiers = new fields.ArrayField(new fields.ObjectField());
    schema.options = new fields.ArrayField(new fields.ObjectField());
    
    return schema;
  }
}